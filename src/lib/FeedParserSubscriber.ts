import csv from 'csv-parse/lib/sync'
// import { Client, Msg, NatsError, Subscription } from 'ts-nats'
import { Message, Stan, Subscription, SubscriptionOptions } from 'node-nats-streaming'
import events from 'events'
import {
  IParserOptions,
  IStats,
  IPublisherMsgData, IParsedData
} from './FeedParser'

const TAB_RE = /\\t/g

export const enum EventTypes {
  error = 'error'
}

const BROKEN_CHARS = ['Ã', 'Ÿ', '�', '¶', '', '¤']

export abstract class FeedParserSubscriber<T, K> {
  readonly name: string
  private readonly sc: Stan
  private subscription!: Subscription
  private readonly ee: events.EventEmitter
  private subscriptionOptions: SubscriptionOptions

  constructor (name:string, sc: Stan) {
    this.name = name
    this.sc = sc
    this.ee = new events.EventEmitter()
    this.subscriptionOptions = sc.subscriptionOptions().setStartWithLastReceived().setMaxInFlight(1)
    this.subscription = this.sc.subscribe(
      `${this.name}.publisher`,
      this.name, // queue group
      this.subscriptionOptions
    )
  }

  init () {
    this.subscription.on('message', (msg: Message) => this.onMsg(msg))
  }

  private onMsg (msg: Message) {
    const stats = parsedStatsFactory()
    const data: IPublisherMsgData<T> = JSON.parse(msg.getData() as string)
    const parsedLines = data.buffer
      .map(line => parseCSV(line, data.parserOptions, stats))
      .filter(line => line) as string[][]

    this.process(parsedLines, data, stats)
      .then((replyData: IParsedData<T, K>) => {
        return this.reply(data.reply, replyData)
      })
      .catch(e => this.ee.emit(EventTypes.error, e))
  }

  abstract async process(parsedLines: string[][], publisherMsgData: IPublisherMsgData<T>, stats: IStats): Promise<IParsedData<T, K>>

  reply (subject: string, data: IParsedData<T, K>) {
    return new Promise((resolve, reject) => {
      this.sc.publish(subject, JSON.stringify(data), (err, guid) => {
        if (err) {
          reject(err)
        }
        resolve(guid)
      })
    })
  }

  // for soft shut down during scaling
  drain () {
    this.subscription.unsubscribe()
    this.sc.close()
    this.ee.removeAllListeners(EventTypes.error)
  }

  on (event:EventTypes, fn: (data: any) => void) {
    this.ee.on(event, fn)
  }

  once (event:EventTypes, fn: (data: any) => void) {
    this.ee.once(event, fn)
  }
}

function parseCSV (line: string, options: IParserOptions, stats: IStats): string[] | null {
  const delimiter = options.delimiter!.toString().replace(TAB_RE, '\t')
  try {
    const parsedValues = csv(line, {
      ...options,
      delimiter
    })[0]
    stats.processed++
    if (BROKEN_CHARS.some((char) => checkChar(parsedValues, char))) {
      stats.wrongEncoding++
    }
    return parsedValues
  } catch (e) {
    stats.processed++
    stats.errors++
    return null
  }
}

function parsedStatsFactory (): IStats {
  return {
    errors: 0,
    processed: 0,
    wrongEncoding: 0
  }
}

function checkChar (values: string[], char: string) {
  return values.some(value => value.includes(char))
}
