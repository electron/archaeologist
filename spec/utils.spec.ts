import { SEMVER_LABELS } from '../src/constants';
import {getCheckStatusItems, checkStatuses} from '../src/utils/check-utils'
const PROpenedEvent = require('./fixtures/pull_request.opened.json');

const semverNoneLabel = {
    name: SEMVER_LABELS.NONE,
    color: '000'
  };
  const semverMinorLabel = {
    name: SEMVER_LABELS.MINOR,
    color: '000'
  };
  const semverMajorLabel = {
    name: SEMVER_LABELS.MAJOR,
    color: '000'
  };

describe('utils', () => {
    describe('getCheckStatusItems()', () => {
  
      const context = {
        octokit: {},
        repo: jest.fn(),
        ...PROpenedEvent,
      };
  
      it('should return the valid changes status when changes are detected with a semver/minor label', () => {
        context.payload.pull_request.labels = [semverMinorLabel]
        const result = getCheckStatusItems({context, hasChanges: true});
        expect(result).toEqual(checkStatuses.validChanges);
      });

      it('should return the invalid changes status when changes are detected with a semver/none label', () => {
        context.payload.pull_request.labels = [semverNoneLabel]
        const result = getCheckStatusItems({context, hasChanges: true});
        expect(result).toEqual(checkStatuses.invalidChanges);
      });

      it('should return the invalid changes status when changes are detected with no semver labels', () => {
        context.payload.pull_request.labels = []
        const result = getCheckStatusItems({context, hasChanges: true});
        expect(result).toEqual(checkStatuses.invalidChanges);
      });

      it('should return the valid status when no changes are detected with a semver/none label', () => {
        context.payload.pull_request.labels = [semverNoneLabel]
        const result = getCheckStatusItems({context, hasChanges: false});
        expect(result).toEqual(checkStatuses.validNoChanges);
      });

      it('should return the invalid status when no changes are detected with a semver/major label', () => {
        context.payload.pull_request.labels = [semverMajorLabel]
        const result = getCheckStatusItems({context, hasChanges: false});
        expect(result).toEqual(checkStatuses.invalidNoChanges);
      });
    }) 
})
