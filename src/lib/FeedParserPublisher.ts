import { Message, Stan, Subscription, SubscriptionOptions } from 'node-nats-streaming'
import { v4 } from 'uuid'
import events from 'events'
import {
  IStats,
  IParserOptions,
  IErrorEventData,
  IPublisherMsgData,
  IParsedData
} from './FeedParser'

export interface IParams {
  name: string
  replySuffix: string
  rStream: NodeJS.ReadableStream // sanitised stream where chunk is line!
  sc: Stan
  parserOptions: IParserOptions
}

interface IEndData {
  lines: number,
  messages: number
}

export const enum EventTypes {
  error = 'error',
  end = 'end',
  finish = 'finish'
}

export abstract class FeedParserPublisher<T, K> {
  private readonly rStream: NodeJS.ReadableStream
  private readonly sc: Stan
  readonly parserOptions: IParserOptions
  private lineCount: number
  readonly uuid: string
  private subscription: Subscription
  readonly stats: IStats
  private isStarted: boolean
  private isEnd: boolean
  private readonly ee: events.EventEmitter
  private sendMSGNumber: number
  readonly replySubject: string
  readonly timestamp: number
  readonly name: string
  readonly subscriptionOptions: SubscriptionOptions
  private recievedMSGNumber: number
  private msgGuid: string[]

  constructor ({ name, replySuffix, rStream, sc, parserOptions }: IParams) {
    this.sc = sc
    this.rStream = rStream
    this.parserOptions = parserOptions
    this.lineCount = 0
    this.uuid = v4()
    this.stats = {
      processed: 0,
      errors: 0,
      wrongEncoding: 0
    }
    this.sendMSGNumber = 0
    this.recievedMSGNumber = 0
    this.isStarted = false
    this.isEnd = false
    this.ee = new events.EventEmitter()
    this.replySubject = `${name}.reply.${replySuffix}.${this.uuid}`
    this.timestamp = +new Date()
    this.name = name
    this.subscriptionOptions = sc.subscriptionOptions().setDeliverAllAvailable()
    this.subscription = this.sc.subscribe(
      this.replySubject,
      this.subscriptionOptions
    )
    this.msgGuid = []
  }

  get msgNumber () {
    return this.sendMSGNumber
  }

  async start () {
    if (this.isStarted) {
      throw new Error('Parsing is already pending, create new instance')
    }
    this.isStarted = true
    try {
      this.subscription.on('message', (msg: Message) => this.onMsg(msg))
      await this.init()
    } catch (e) {
      this.drop()
      throw e
    }
  }

  private async init () {
    const buffer: string[] = []

    for await (const line of this.rStream) {
      if (++this.lineCount === 1 && this.parserOptions.skipFirst) {
        continue
      }
      buffer.push(line as string)

      if (buffer.length === this.parserOptions.messageMaxLineNumber) {
        this.sendMSGNumber++
        this.publishBuf(buffer)
        buffer.length = 0
      }
    }

    if (buffer.length) {
      this.sendMSGNumber++
      this.publishBuf(buffer)
      buffer.length = 0
    }
    this.isEnd = true
    this.ee.emit(EventTypes.end, { lines: this.totalLines, messages: this.sendMSGNumber })
  }

  get totalLines () {
    return this.parserOptions.skipFirst ? this.lineCount - 1 : this.lineCount
  }

  /**
   * use .publish to publish additional data with buffer
   * @param buffer
   */
  abstract publishBuf (buffer: string[]): void

  publish (data: IPublisherMsgData<T>) {
    this.sc.publish(`${this.name}.publisher`, JSON.stringify(data), (err, guid) => {
      if (err) {
        this.ee.emit(EventTypes.error, err)
        return
      }
      this.msgGuid.push(guid)
    })
  }

  private onMsg (msg: Message) {
    const data: IParsedData<T, K> = JSON.parse(msg.getData() as string)
    this.stats.processed += data.stats.processed
    this.stats.errors += data.stats.errors
    this.stats.wrongEncoding += data.stats.wrongEncoding
    this.process(data)
    if (this.isEnd && ++this.recievedMSGNumber === this.sendMSGNumber) {
      this.ee.emit(EventTypes.finish)
      this.drop()
    }
  }

  abstract process (data: IParsedData<T, K>): void

  drop () {
    this.ee.removeAllListeners(EventTypes.error)
    this.ee.removeAllListeners(EventTypes.finish)
    this.ee.removeAllListeners(EventTypes.end)
    this.subscription.unsubscribe()
  }

  on (event:EventTypes, fn: (data?: IEndData | IErrorEventData) => void) {
    this.ee.on(event, fn)
  }

  once (event:EventTypes, fn: (data?: IEndData | IErrorEventData) => void) {
    this.ee.once(event, fn)
  }
}
