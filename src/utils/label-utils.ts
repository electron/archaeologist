import { SEMVER_PREFIX } from '../constants';
import { PR } from '../types';

export const getSemverLabel = (pr: Pick<PR, 'labels'>) => {
  return pr.labels.find((l: any) => l.name.startsWith(SEMVER_PREFIX));
};
