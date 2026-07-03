import { getFeedbackVisibilityNotice, toSentenceCase } from '@pkg/domain';
import type { FeedbackKind, FeedbackSubjectType } from '@pkg/schema';
import { IconEye, IconLock } from '@tabler/icons-react';
import type React from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { cn } from '@/lib/utils.js';

/** Visibility notice on the feedback form so a submitter knows who will see their words. */
export const FeedbackVisibilityBanner: React.FC<{
  kind: FeedbackKind;
  subjectType: FeedbackSubjectType;
}> = ({ kind, subjectType }) => {
  const notice = getFeedbackVisibilityNotice(kind, subjectType);
  const isPublic = notice.visibility === 'public';

  return (
    <Alert
      className={cn(
        'items-center has-[>svg]:gap-x-3 *:[svg]:row-span-1 *:[svg]:self-center *:[svg]:translate-y-0',
        isPublic
          ? 'border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-200'
          : 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200',
      )}
    >
      {isPublic ? <IconEye aria-hidden /> : <IconLock aria-hidden />}
      <AlertDescription className="leading-5 text-current/80">
        <span className="font-semibold text-current">{toSentenceCase(notice.title)}: </span>
        {notice.description}
      </AlertDescription>
    </Alert>
  );
};
