import { spawn } from "node:child_process";

/**
 * מריץ פקודה עם NEXT_PUBLIC_DEMO_MODE=true
 * (עובד גם ב-Windows בלי cross-env)
 *
 * דוגמה: node scripts/with-demo-env.mjs next dev
 */
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/with-demo-env.mjs <command> [...args]");
  process.exit(1);
}

const env = {
  ...process.env,
  NEXT_PUBLIC_DEMO_MODE: "true",
};

const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
