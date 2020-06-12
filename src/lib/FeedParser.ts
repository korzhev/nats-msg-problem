import parse from 'csv-parse'
import { Msg, NatsError } from 'ts-nats'

export interface IStats {
  processed: number
  errors: number
  wrongEncoding: number
}

export interface IParserOptions extends parse.Options{
  skipFirst: boolean
  messageMaxLineNumber: number
}

export interface IErrorEventData {
  error: NatsError,
  msg: Msg
}

export interface IPublisherMsgData<T> {
  timestamp: number
  buffer: string[]
  parserOptions: IParserOptions
  publisherData: T
  reply: string
}

export interface IParsedData<T, K> {
  timestamp: number
  parsedLines: string[][]
  stats: IStats,
  subscriberData: K
  publisherData: T
}
