const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.resolve(
  path.join(__dirname, 'user_event_statistics'),
  'jest-execution-times.csv',
); // File to persist execution times
const NUM_RUNS = 10; // Number of times to run Jest

// Parse Jest runtime from the output
const parseRuntime = (jestOutput) => {
  const runtimeMatch = jestOutput.match(/Done in ([0-9.]+)s/);
  return runtimeMatch ? parseInt(parseFloat(runtimeMatch[1]) * 1000) : null; // Convert seconds to milliseconds
};

// Run Jest command and capture the execution time
const runJest = (index, command) => {
  return new Promise((resolve, reject) => {
    console.log(`Starting Jest run #${index + 1}...`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error during Jest run #${index + 1}:`, error.message);
        return reject({ index, error: error.message });
      }

      const runtime = parseRuntime(stdout);
      if (runtime === null) {
        console.error(`Could not parse runtime for Jest run #${index + 1}`);
        return reject({ index, error: 'Runtime parsing failed' });
      }

      console.log(`Completed Jest run #${index + 1}: ${runtime}ms`);
      resolve({ index, runtime });
    });
  });
};

// Write results to CSV
const writeResultsToCSV = (results) => {
  const csvHeader = 'Run Number,Execution Time (ms)\n';
  const csvRows = results.map(({ index, runtime }) => `${index + 1},${runtime}`).join('\n');
  const csvContent = csvHeader + csvRows;

  fs.writeFileSync(OUTPUT_FILE, csvContent, 'utf-8');
  console.log(`Results saved to ${OUTPUT_FILE}`);
};

// Main function
const main = async () => {
  // Get folder path and command template from command-line arguments
  const folderPath = process.argv[2];
  const command = `yarn test:ci --no-cache ${folderPath}`;

  const results = [];

  for (let i = 0; i < NUM_RUNS; i++) {
    try {
      const result = await runJest(i, command);
      results.push(result);
    } catch (error) {
      console.error(`Failed to complete Jest run #${i + 1}:`, error.error || error);
    }
  }

  const averageRuntime = parseInt(
    results.reduce((acc, { runtime }) => acc + runtime, 0) / results.length,
  );

  results.push({
    index: 'Average',
    runtime: averageRuntime,
  });

  writeResultsToCSV(results);
};

main().catch((err) => {
  console.error('An error occurred while running the script:', err);
});
