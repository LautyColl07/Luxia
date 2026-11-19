function timestamp(value) {
  if (value === undefined || value === null || value === '') return Number.NaN;
  return new Date(value).getTime();
}

function hasCompletion(hearing) {
  return hearing?.completedAt !== undefined && hearing?.completedAt !== null && hearing.completedAt !== '';
}

function stableHearingId(first, second) {
  return String(first?.id ?? first?.hearingId ?? '').localeCompare(
    String(second?.id ?? second?.hearingId ?? ''),
    undefined,
    { numeric: true }
  );
}

export function sortHearingsByDate(hearings = [], field = 'date', direction = 'oldest', undatedLast = false) {
  const multiplier = direction === 'newest' ? -1 : 1;
  return [...hearings].sort((first, second) => {
    const firstTime = timestamp(first?.[field]);
    const secondTime = timestamp(second?.[field]);

    if (undatedLast) {
      const firstIsDated = Number.isFinite(firstTime);
      const secondIsDated = Number.isFinite(secondTime);
      if (firstIsDated !== secondIsDated) return firstIsDated ? -1 : 1;
    }

    const firstValue = Number.isFinite(firstTime) ? firstTime : Number.NEGATIVE_INFINITY;
    const secondValue = Number.isFinite(secondTime) ? secondTime : Number.NEGATIVE_INFINITY;
    if (firstValue !== secondValue) return (firstValue - secondValue) * multiplier;
    return stableHearingId(first, second);
  });
}

export function groupHearingsForDisplay(hearings = [], now = Date.now()) {
  const referenceTime = new Date(now).getTime();
  const groups = {
    inProgressHearings: [],
    upcomingHearings: [],
    recentHearings: [],
    undatedHearings: [],
  };

  for (const hearing of hearings) {
    const scheduledTime = timestamp(hearing?.date);
    if (hasCompletion(hearing)) groups.recentHearings.push(hearing);
    else if (!Number.isFinite(scheduledTime)) groups.undatedHearings.push(hearing);
    else if (scheduledTime < referenceTime) groups.inProgressHearings.push(hearing);
    else groups.upcomingHearings.push(hearing);
  }

  groups.inProgressHearings = sortHearingsByDate(groups.inProgressHearings, 'date', 'newest');
  groups.upcomingHearings = sortHearingsByDate(groups.upcomingHearings, 'date', 'oldest');
  groups.recentHearings = sortHearingsByDate(groups.recentHearings, 'completedAt', 'newest');
  groups.undatedHearings = sortHearingsByDate(groups.undatedHearings, 'date', 'oldest');
  return groups;
}
