import { connect as stanConnect, Stan } from 'node-nats-streaming'
import { lines, lines2 } from './fixture'
import { Readable } from 'stream'
import { Subscriber } from './Subscriber'
import { Publisher } from './Publisher'
import { EventTypes as PublisherEventTypes } from '../FeedParserPublisher'
import { IStats } from '../FeedParser'

interface ITestFinishResult {
  stats: IStats,
  acc: string[]
}

const clusterID = 'test-cluster'

describe('Publisher - Subscriber integration test', () => {
  let pClient: Stan, p2Client: Stan
  let sClient: Stan, s2Client: Stan, s3Client: Stan
  beforeEach(async () => {
    function connect (clusterID: string, clientID: string): Promise<Stan> {
      return new Promise((resolve, reject) => {
        const stan = stanConnect(clusterID, clientID)
        stan.once('connect', () => resolve(stan))
        stan.once('error', reject)
      })
    }
    [pClient, sClient, p2Client, s2Client, s3Client] = await Promise.all([
      connect(clusterID, 'pClient'),
      connect(clusterID, 'sClient'),
      connect(clusterID, 'p2Client'),
      connect(clusterID, 's2Client'),
      connect(clusterID, 's3Client')
    ])
  })
  afterEach(async () => {
    pClient.close()
    p2Client.close()
    sClient.close()
    s2Client.close()
    s3Client.close()
  })

  test.only('many to many', async () => {
    const stream = Readable.from(lines, { encoding: 'utf8' })
    const stream2 = Readable.from(lines2, { encoding: 'utf8' })

    const p = new Publisher({
      name: 'test',
      replySuffix: 'integration',
      rStream: stream,
      sc: pClient,
      parserOptions: {
        skipFirst: false,
        messageMaxLineNumber: 5,
        relax: true,
        bom: true,
        columns: false,
        delimiter: ';',
        relax_column_count: true,
        skip_empty_lines: true,
        escape: '"',
        quote: ''
      }
    })
    const p2 = new Publisher({
      name: 'test',
      replySuffix: 'integration',
      rStream: stream2,
      sc: p2Client,
      parserOptions: {
        skipFirst: true,
        messageMaxLineNumber: 6,
        relax: true,
        bom: true,
        columns: false,
        delimiter: ';',
        relax_column_count: true,
        skip_empty_lines: true,
        escape: '"',
        quote: ''
      }
    })

    const s = new Subscriber('test', sClient)
    const s2 = new Subscriber('test', s2Client)
    const s3 = new Subscriber('test', s3Client)

    expect(p.name).toBe(s.name)
    expect(p2.name).toBe(s.name)
    expect(p2.name).toBe(s3.name)
    expect(p2.name).toBe(s2.name)

    s.init()
    s2.init()
    s3.init()

    //
    // await (new Promise(resolve => {
    //   setTimeout(resolve, 2000)
    // }))

    const fn = jest.fn(() => {})
    const fn2 = jest.fn(() => {})

    p.once(PublisherEventTypes.end, fn)
    p2.once(PublisherEventTypes.end, fn2)
    p.start()
    p2.start()

    const [{ stats, acc }, { stats: stats2, acc: acc2 }] = await Promise.all([
      (new Promise((resolve, reject) => {
        p.on(PublisherEventTypes.error, reject)
        p.on(PublisherEventTypes.finish, () => {
          const result: ITestFinishResult = { stats: p.stats, acc: p.acc }
          resolve(result)
        })
      })) as Promise<ITestFinishResult>,
      (new Promise((resolve, reject) => {
        p2.on(PublisherEventTypes.error, reject)
        p2.on(PublisherEventTypes.finish, () => {
          const result: ITestFinishResult = { stats: p2.stats, acc: p2.acc }
          resolve(result)
        })
      })) as Promise<ITestFinishResult>
    ])

    expect(fn.mock.calls).toHaveLength(1)
    expect(fn2.mock.calls).toHaveLength(1)
    expect(fn.mock.calls[0]).toEqual([{ lines: 12, messages: 3 }])
    expect(fn2.mock.calls[0]).toEqual([{ lines: 9, messages: 2 }])

    expect(stats).toEqual({
      errors: 0,
      processed: 12,
      wrongEncoding: 1
    })
    expect(acc).toEqual(['2', '2', '2'])

    expect(stats2).toEqual({
      errors: 0,
      processed: 9,
      wrongEncoding: 0
    })
    expect(acc2).toEqual(['2', '2'])
  })
})
