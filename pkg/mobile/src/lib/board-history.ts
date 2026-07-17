import { BoardListInput } from '@pkg/schema';

// The server clamps this sentinel to the supported rolling history window, keeping mobile aligned
// with the web Gantt without deriving the plant business date on-device.
export const mobileBoardHistoryInput = BoardListInput.parse({ from: '2000-01-01' });
