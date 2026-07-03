import { getFeedbackVisibilityNotice } from '@pkg/domain';
import type { FeedbackKind, FeedbackSubjectType } from '@pkg/schema';
import { IconEye, IconLock } from '@tabler/icons-react';
import type React from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { cn } from '@/lib/utils.js';

/** Loud PUBLIC/PRIVATE notice on the feedback form so a submitter knows who will see their words. */
export const FeedbackVisibilityBanner: React.FC<{
  kind: FeedbackKind;
  subjectType: FeedbackSubjectType;
}> = ({ kind, subjectType }) => {
  const notice = getFeedbackVisibilityNotice(kind, subjectType);
  const isPublic = notice.visibility === 'public';

  return (
    <Alert
      className={cn(
        isPublic
          ? 'border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-200'
          : 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200',
      )}
    >
      {isPublic ? <IconEye aria-hidden /> : <IconLock aria-hidden />}
      <AlertTitle className="text-base font-semibold tracking-wide">{notice.title}</AlertTitle>
      <AlertDescription className="text-current/80">{notice.description}</AlertDescription>
    </Alert>
  );
};
