declare module 'connect-redis' {
  export default class RedisStore {
    constructor(opts: any)
    on?: (...args: any[]) => void
    get?: (sid: string, cb: (err: any, sess?: any) => void) => void
    set?: (sid: string, sess: any, cb?: (err?: any) => void) => void
    destroy?: (sid: string, cb?: (err?: any) => void) => void
  }
  export { RedisStore };
}

