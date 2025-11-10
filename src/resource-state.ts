import { seconds } from './utils/time';
import {
  Resource,
  SuccessfullResource,
  ErroredResult,
  FullfiledResult,
} from './types';

export function successfullResource<T>(
  resource?: Resource<T>
): resource is SuccessfullResource<T> {
  return (
    resource?.status === 'fulfilled' || resource?.status === 'revalidating'
  );
}

// Backward compatibility alias (typo in original)

export function failedResource<T>(
  resource?: Resource<T>
): resource is ErroredResult<T> {
  return resource?.status === 'rejected';
}

export function isStale<T>(
  ttl: number,
  resource?: Resource<T>
): resource is FullfiledResult<T> {
  return (
    resource?.status === 'fulfilled' &&
    resource?.timestamp + seconds(ttl) < Date.now()
  );
}
