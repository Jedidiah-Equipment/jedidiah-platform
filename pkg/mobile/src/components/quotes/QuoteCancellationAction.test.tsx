import type { QuoteDetail } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@tabler/icons-react-native', () => ({ IconTrash: 'IconTrash' }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { QuoteCancellationAction } from './QuoteCancellationAction';

const lockedQuote = {
  hasEverSourcedJob: true,
  kind: 'product',
  productUnitId: null,
  status: 'accepted',
} as unknown as QuoteDetail;

describe('QuoteCancellationAction', () => {
  // Without this the Status field is the only route to cancellation, and a Locked Quote disables it.
  test('offers the action for a Locked Quote to a user who may cancel one', () => {
    const onPress = vi.fn();
    const action = QuoteCancellationAction({ canCancel: true, onPress, quote: lockedQuote });

    expect(action).not.toBeNull();
  });

  test('withholds it from a user without the permission, and once the Quote is cancelled', () => {
    expect(QuoteCancellationAction({ canCancel: false, onPress: vi.fn(), quote: lockedQuote })).toBeNull();
    expect(
      QuoteCancellationAction({
        canCancel: true,
        onPress: vi.fn(),
        quote: { ...lockedQuote, status: 'cancelled' } as QuoteDetail,
      }),
    ).toBeNull();
  });
});
