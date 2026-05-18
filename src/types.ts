export type SessionRecord = {
  userId: string;
  sessionString: string;
  active: boolean;
};

export type ServiceUser = {
  userId: number;
  username: string;
};

export type GroupSummary = {
  chatId: string;
  title: string;
};

export type GroupMember = {
  userId: string;
  username?: string;
  firstName: string;
  lastName: string;
  isBot: boolean;
  isPremium?: boolean;
  phone?: string;
};
