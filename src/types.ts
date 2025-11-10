type BaseResource = {
  timestamp: number;
  $version: number;
};

export type Resource<T> =
  | ({
      error: Error;
      status: Extract<ResourceStatus, 'rejected'>;
    } & BaseResource)
  | ({
      result: T;
      status: Extract<ResourceStatus, 'fulfilled'>;
    } & BaseResource)
  | {
      status: Extract<ResourceStatus, 'pending'>;
      suspender: Promise<T>;
    }
  | ({
      result: T;
      status: Extract<ResourceStatus, 'revalidating'>;
      suspender: Promise<T>;
    } & BaseResource);

export type ResourceStatus =
  | 'pending'
  | 'fulfilled'
  | 'rejected'
  | 'revalidating';

export type ResourceResult<T = unknown> = {
  suspender: Promise<T>;
  timestamp: number;
  $version: number;
};

export type MightBePromise<T> = T | Promise<T>;

export type FullfiledResult<T> = Extract<Resource<T>, { status: 'fulfilled' }>;
export type ErroredResult<T> = Extract<Resource<T>, { status: 'rejected' }>;
export type RevalidatingResource<T> = Extract<
  Resource<T>,
  { status: 'revalidating' }
>;
export type PendingResource<T> = Extract<Resource<T>, { status: 'pending' }>;
export type SuccessfullResource<T> = Extract<
  Resource<T>,
  { status: 'fulfilled' | 'revalidating' }
>;
