export default async function teardown() {
  const response = await fetch("http://127.0.0.1:4174/__test/cleanup", { method: "POST" });
  if (!response.ok || !(await response.json()).cleaned) throw new Error("Disposable learning database cleanup failed");
}
