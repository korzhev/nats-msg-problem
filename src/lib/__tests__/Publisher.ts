import { FeedParserPublisher, IParams } from '../FeedParserPublisher'
import { ITestSubscriberData } from './Subscriber'
import { IParsedData, IPublisherMsgData } from '../FeedParser'

export interface ITestPublisherData {
  field: number
}

export class Publisher extends FeedParserPublisher<ITestPublisherData, ITestSubscriberData> {
  acc: string[]
  constructor (params: IParams) {
    super(params)
    this.acc = []
  }

  publishBuf (buffer: string[]) {
    const data: IPublisherMsgData<ITestPublisherData> = {
      buffer,
      timestamp: this.timestamp,
      parserOptions: this.parserOptions,
      publisherData: { field: 1 },
      reply: this.replySubject
    }
    this.publish(data)
  }

  process (data: IParsedData<ITestPublisherData, ITestSubscriberData>) {
    this.acc.push(data.subscriberData.prop)
  }
}
