const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const rimraf = require('rimraf');

// Parse command line arguments
const args = process.argv.slice(2);
const runId = args[0];

if (!runId) {
  console.error('Please provide a run_id as an argument');
  console.error('Usage: node merge-caller-logs.js RUN_ID');
  process.exit(1);
}

// Create a temporary directory for artifacts
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caller-info-'));

// Output file path
const outputFile = path.join(__dirname, 'caller-info.json');

// Function to download artifacts from GitHub
function downloadArtifacts(runId, downloadDir) {
  console.log(`Downloading artifacts for run ID: ${runId}`);
  try {
    execSync(`gh run download ${runId} -R thinkei/frontend-core -D "${downloadDir}"`, {
      stdio: 'inherit',
    });
    console.log('Artifacts downloaded successfully');
  } catch (error) {
    console.error('Failed to download artifacts:', error.message);
    process.exit(1);
  }
}

// Function to find all JSON files in the downloaded artifacts
function findJsonFiles(dir) {
  const files = [];

  function scanDir(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  }

  scanDir(dir);
  return files;
}

// Function to merge all caller info files
function mergeCallerInfoFiles(filesArray) {
  // Create a structure to hold merged data
  const mergedData = {
    testRunInfo: {
      timestamp: new Date().toISOString(),
      numPassedTests: 0,
      numFailedTests: 0,
      numTotalTests: 0,
    },
    callerLog: [],
  };

  // Track unique calls by file and line to avoid duplicates
  const uniqueCalls = new Set();

  // Process each file
  filesArray.forEach((filePath) => {
    try {
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Update test run info with the latest values
      if (fileData.testRunInfo) {
        // Keep only the most recent test run info
        if (new Date(fileData.testRunInfo.timestamp) > new Date(mergedData.testRunInfo.timestamp)) {
          mergedData.testRunInfo = fileData.testRunInfo;
        }
      }

      // Add caller logs, avoiding duplicates
      if (fileData.callerLog && Array.isArray(fileData.callerLog)) {
        fileData.callerLog.forEach((call) => {
          const callKey = `${call.method}|${call.file}|${call.line}`;
          if (!uniqueCalls.has(callKey)) {
            uniqueCalls.add(callKey);
            mergedData.callerLog.push(call);
          }
        });
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error.message);
    }
  });

  // Sort caller logs by file path and line number
  mergedData.callerLog.sort((a, b) => {
    const fileComparison = a.file.localeCompare(b.file);
    if (fileComparison !== 0) return fileComparison;
    return parseInt(a.line, 10) - parseInt(b.line, 10);
  });

  return mergedData;
}

// Main function
async function main() {
  try {
    // Download artifacts
    downloadArtifacts(runId, tempDir);

    // Find all JSON files in the downloaded artifacts
    const jsonFiles = findJsonFiles(tempDir);
    console.log(`Found ${jsonFiles.length} JSON files to process`);

    if (jsonFiles.length === 0) {
      console.error('No JSON files found in downloaded artifacts');
      process.exit(1);
    }

    // Merge the files
    const mergedData = mergeCallerInfoFiles(jsonFiles);

    // Write the merged data to the output file
    fs.writeFileSync(outputFile, JSON.stringify(mergedData, null, 2));
    console.log(`Merged caller logs saved to ${outputFile}`);
  } catch (error) {
    console.error('Error during processing:', error);
  } finally {
    // Clean up temporary directory
    try {
      rimraf.sync(tempDir);
      console.log(`Cleaned up temporary directory: ${tempDir}`);
    } catch (cleanupError) {
      console.error('Failed to clean up temporary directory:', cleanupError);
    }
  }
}

// Run the main function
main();
