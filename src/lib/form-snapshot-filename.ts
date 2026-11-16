/** שם קובץ עותק ארכיון של טופס ממולא (formSnapshotToFile) */

export function formSnapshotFileName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]/g, "-")}.html`;
}
