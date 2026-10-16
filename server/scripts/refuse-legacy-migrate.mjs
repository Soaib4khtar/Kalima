process.stderr.write(
  [
    "Migration refused: the default Drizzle directory contains a destructive legacy migration.",
    "The frozen v2 baseline is not active and its permanent runner still requires isolated end-to-end testing.",
    "Read drizzle-v2/README.md and obtain the required approval before any database adoption work.",
  ].join("\n") + "\n",
);
process.exitCode = 1;
