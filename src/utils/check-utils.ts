import { SEMVER_LABELS } from '../constants';
import { CheckRunStatus, CheckStatus, PRContext } from '../types';
import { getSemverLabel } from './label-utils';

// Define the possible check statuses
const checkStatuses = {
  validNoChanges: {
    conclusion: CheckRunStatus.SUCCESS,
    title: 'No Changes',
    summary: "We couldn't see any changes in the `electron.d.ts` artifact",
  },
  invalidNoChanges: {
    conclusion: CheckRunStatus.FAILURE,
    title: 'Label Mismatch with No Changes',
    summary: "No changes detected despite the presence of 'semver/minor' or 'semver/major' labels.",
  },
  validChanges: {
    conclusion: CheckRunStatus.NEUTRAL,
    title: 'Changes Detected',
    summary: '',
  },
  invalidChanges: {
    conclusion: CheckRunStatus.FAILURE,
    title: 'Label Mismatch with Changes Detected',
    summary: "Changes detected despite the presence of 'semver/none' label. ",
  },
};

// Helper function to check if a semver label is valid for if `electron.d.ts` changes detected
function isSemverLabelValidForChanges(semverLabel: string | undefined) {
  if (!semverLabel) {
    return false;
  }

  return new Set([SEMVER_LABELS.PATCH, SEMVER_LABELS.MINOR, SEMVER_LABELS.MAJOR]).has(semverLabel);
}

function isSemverLabelValidForNoChanges(semverLabel: string | undefined) {
  return !semverLabel || semverLabel === SEMVER_LABELS.NONE;
}

// Function to get the appropriate check status
export function getCheckStatusItems(context: PRContext, hasChanges: boolean) {
  const semverLabel = getSemverLabel(context.payload.pull_request);

  if (hasChanges) {
    // If changes are detected
    return isSemverLabelValidForChanges(semverLabel?.name)
      ? checkStatuses.validChanges
      : checkStatuses.invalidChanges;
  }
  // If no changes are detected
  return isSemverLabelValidForNoChanges(semverLabel?.name)
    ? checkStatuses.validNoChanges
    : checkStatuses.invalidNoChanges;
}
