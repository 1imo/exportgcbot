export const GROUPS_BUTTON = "Groups";
export const CANCEL_BUTTON = "Cancel";

type ReplyKeyboardExtra = {
  reply_markup: {
    keyboard: Array<Array<{ text: string }>>;
    resize_keyboard?: boolean;
    one_time_keyboard?: boolean;
    persistent?: boolean;
  };
};

export const mainMenuKeyboard = (): ReplyKeyboardExtra => ({
  reply_markup: {
    keyboard: [[{ text: GROUPS_BUTTON }]],
    resize_keyboard: true,
    persistent: true
  }
});

export const cancelKeyboard = (): ReplyKeyboardExtra => ({
  reply_markup: {
    keyboard: [[{ text: CANCEL_BUTTON }]],
    resize_keyboard: true,
    one_time_keyboard: true
  }
});

export function groupPickerKeyboard(labels: string[]): ReplyKeyboardExtra {
  const rows = labels.map((label) => [{ text: label }]);
  rows.push([{ text: CANCEL_BUTTON }]);
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

export function truncateKeyboardLabel(title: string, maxLen = 60): string {
  const trimmed = title.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}
