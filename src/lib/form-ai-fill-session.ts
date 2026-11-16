/** מצב מילוי AI בין ריצות — נשמר ב-ref ברמת דף המילוי (שורד מסך «טוען…» אחרי עדכון fillId ב-URL). */
export type FormAiFillSession = {
  aiFillCount: number;
  lastAiValues: Record<string, string>;
  aiFilledKeys: Set<string>;
};

export function createFormAiFillSession(): FormAiFillSession {
  return {
    aiFillCount: 0,
    lastAiValues: {},
    aiFilledKeys: new Set(),
  };
}

export function recordFormAiFillApply(
  session: FormAiFillSession,
  appliedValues: Record<string, string>
): void {
  session.aiFillCount += 1;
  if (Object.keys(appliedValues).length === 0) {
    return;
  }
  session.lastAiValues = { ...session.lastAiValues, ...appliedValues };
  for (const key of Object.keys(appliedValues)) {
    session.aiFilledKeys.add(key);
  }
}
