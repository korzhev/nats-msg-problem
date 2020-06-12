import { FeedParserSubscriber } from '../FeedParserSubscriber'
import { IParsedData, IPublisherMsgData, IStats } from '../FeedParser'
import { ITestPublisherData } from './Publisher'

export interface ITestSubscriberData{
  prop: string
}

export class Subscriber extends FeedParserSubscriber<ITestPublisherData, ITestSubscriberData> {
  async process (parsedLines: string[][], data: IPublisherMsgData<ITestPublisherData>, stats: IStats) {
    const replyData: IParsedData<ITestPublisherData, ITestSubscriberData> = {
      timestamp: data.timestamp,
      parsedLines,
      publisherData: data.publisherData,
      stats,
      subscriberData: { prop: `${data.publisherData.field * 2}` }
    }
    return replyData
  }
}
