#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

/**
 * Parse command line arguments using yargs
 * @returns {Object} Parsed arguments including configPath and folderPath
 */
const parseArgs = () => {
  return yargs(hideBin(process.argv))
    .usage('Usage: $0 -c <config-file> <path>')
    .option('c', {
      alias: 'config',
      describe: 'Path to configuration file (JSON with jestRunner and reportPath properties)',
      type: 'string',
      demandOption: true,
      requiresArg: true,
    })
    .example(
      '$0 -c custom-config.json ./src/modules/user',
      'Migrate code in ./src/modules/user using custom-config.json',
    )
    .help('h')
    .alias('h', 'help')
    .demandCommand(1, 'Please provide a folder path to process')
    .epilog(
      'Config file format:\n' +
        '{\n' +
        '  "jestRunner": "cd /path/to/project && yarn nx run app:test",\n' +
        '  "reportPath": "./caller-info.json"\n' +
        '}',
    ).argv;
};

/**
 * Find jscodeshift binary path
 * @returns {string} Path to jscodeshift or command
 */
const findJscodeshiftPath = () => {
  // Try to find jscodeshift in same directory as this script
  const localPath = path.join(__dirname, 'node_modules', '.bin', 'jscodeshift');
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // Try parent directory (for global installs)
  const parentPath = path.join(__dirname, '..', 'node_modules', '.bin', 'jscodeshift');
  if (fs.existsSync(parentPath)) {
    return parentPath;
  }

  // If all else fails, hope it's in PATH
  console.log('Falling back to jscodeshift in PATH');
  return 'jscodeshift';
};

/**
 * Find files matching a pattern recursively
 * @param {string} dir - Directory to search
 * @param {RegExp} pattern - File pattern to match
 * @returns {string[]} Array of matching file paths
 */
const findSpecFiles = (dir, pattern) => {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      results = results.concat(findSpecFiles(filePath, pattern));
    } else if (pattern.test(file)) {
      results.push(filePath);
    }
  });

  return results;
};

/**
 * Validate folder path exists and is a directory
 * @param {string} folderPath - Path to validate
 * @returns {boolean} True if valid, false otherwise
 */
const validateFolderPath = (folderPath) => {
  if (!folderPath) {
    console.error('Please provide a folder path as an argument.');
    return false;
  }

  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    console.error('The provided folder path is not valid.');
    return false;
  }

  return true;
};

/**
 * Read configuration from a JSON file
 * @param {string} configPath - Path to the config file
 * @returns {Object} Configuration object with jestRunner and reportPath
 */
const readConfig = (configPath) => {
  // Check if the config file exists
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Config file not found at ${configPath}`);
    process.exit(1);
  }

  try {
    const config = require(configPath);

    // Validate required config properties
    if (!config.jestRunner || !config.reportPath) {
      console.error('Error: Config file must contain both jestRunner and reportPath properties');
      process.exit(1);
    }

    return {
      jestRunner: config.jestRunner,
      reportPath: config.reportPath,
    };
  } catch (error) {
    console.error(`Error: Could not read config file: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Execute a command on each file
 * @param {string[]} files - Array of file paths
 * @param {string} commandTemplate - Command template with {file} placeholder
 * @returns {Promise<void>} Promise that resolves when all commands are complete
 */
const migrateFireEventToUserEvent = async (files, commandTemplate) => {
  if (files.length === 0) {
    console.log('No files found to process.');
    return;
  }

  // Process files sequentially
  for (const file of files) {
    let command = commandTemplate.replace('{file}', file);
    console.log(`Executing: ${command}`);

    // Execute command and wait for completion
    await new Promise((resolve) => {
      exec(command, (err, stdout, stderr) => {
        if (err) {
          console.error(`Error executing command on ${file}: ${err.message}`);
        }
        if (stdout) {
          console.log(`Output for ${file}:\n${stdout}`);
        }
        if (stderr) {
          console.error(`Error output for ${file}:\n${stderr}`);
        }
        resolve();
      });
    });
  }
};

/**
 * Process report to find places that need user.clear
 * @param {Object} reportContent - Content of the report
 * @returns {Object} Map of files to line numbers
 */
const gatherPlacesToMigrateToUserClear = (reportContent) => {
  const lineLogs = reportContent.callerLog || [];
  const placesToMigrate = lineLogs.reduce((acc, log) => {
    const { method, file, line } = log;
    if (method === '[advancedType] Has value') {
      return {
        ...acc,
        [file]: [...(acc[file] || []), Number(line)],
      };
    }
    return acc;
  }, {});

  // Reverse line numbers to handle multiple on same file without offset issues
  return Object.fromEntries(Object.entries(placesToMigrate).map(([k, v]) => [k, v.reverse()]));
};

/**
 * Phase 1: Convert fire-event to user-event in spec files
 * @returns {Promise<void>} Promise that resolves when phase 1 is complete
 */
const runPhase1FireEventToUserEvent = async (folderPath) => {
  if (!validateFolderPath(folderPath)) {
    process.exit(1);
  }

  // Get path to jscodeshift
  const jscodeshiftPath = findJscodeshiftPath();
  const transformPath = path.join(__dirname, 'dist', 'fire-event-to-user-event.js');
  console.log(`Using transform file: ${transformPath}`);

  // Check if transform file exists
  if (!fs.existsSync(transformPath)) {
    console.error(`Error: Transform file not found at ${transformPath}`);
    process.exit(1);
  }

  const commandTemplate = `${jscodeshiftPath} --parser=tsx -t ${transformPath} {file}`;
  const specFiles = findSpecFiles(folderPath, /\.(spec\.tsx)$/);

  console.log(`Found ${specFiles.length} files to process`);
  console.log(`Command template: ${commandTemplate}`);

  await migrateFireEventToUserEvent(specFiles, commandTemplate);
};

/**
 * Phase 2: Add clear commands where needed
 * @returns {Promise<void>} Promise that resolves when phase 2 is complete
 */
const runPhase2AddClear = async (config) => {
  const reportPath = config.reportPath;

  try {
    const reportContent = require(reportPath);
    const placesToMigrate = gatherPlacesToMigrateToUserClear(reportContent);

    // Get path to jscodeshift
    const jscodeshiftPath = findJscodeshiftPath();
    const transformPath = path.join(__dirname, 'dist', 'add-clear-before-type.js');

    for (const [file, lines] of Object.entries(placesToMigrate)) {
      const linesForFile = lines.join(',');
      // Insert the lines directly in the command
      const commandTemplate = `${jscodeshiftPath} --parser=tsx -t ${transformPath} {file} --lines=${linesForFile}`;
      await migrateFireEventToUserEvent([file], commandTemplate);
    }
  } catch (error) {
    console.error(`Error processing report file: ${error.message}`);
  }
};

/**
 * Phase 3: Migrate user.advancedType to user.type
 * @param {string} folderPath - Path to run the migration on
 * @returns {Promise<void>} Promise that resolves when phase 3 is complete
 */
const runPhase3AdvancedTypeToType = async (folderPath) => {
  if (!validateFolderPath(folderPath)) {
    process.exit(1);
  }

  // Get path to jscodeshift
  const jscodeshiftPath = findJscodeshiftPath();
  const transformPath = path.join(__dirname, 'dist', 'advanced-type-to-type.js');
  console.log(`Using transform file: ${transformPath}`);

  // Check if transform file exists
  if (!fs.existsSync(transformPath)) {
    console.error(`Error: Transform file not found at ${transformPath}`);
    process.exit(1);
  }

  const commandTemplate = `${jscodeshiftPath} --parser=tsx -t ${transformPath} {file}`;
  const specFiles = findSpecFiles(folderPath, /\.(spec\.tsx)$/);

  console.log(`Found ${specFiles.length} files to process for Phase 3`);
  console.log(`Command template: ${commandTemplate}`);

  await migrateFireEventToUserEvent(specFiles, commandTemplate);
};

/**
 * Run Jest tests
 * @param {string} jestRunner - Command to run Jest
 * @param {string} folderPath - Path to run tests on
 * @returns {Promise<void>} Promise that resolves when tests complete
 */
const runJestTests = async (jestRunner, folderPath) => {
  console.log(`Running tests with ${jestRunner} on ${folderPath}...`);

  try {
    await new Promise((resolve, reject) => {
      // The jestRunner can contain a complex command including directory and execution command
      // e.g. "cd /path/to/project && yarn nx run app:test"
      let command = `${jestRunner} --no-watch`;

      // If jestRunner doesn't already include the target path, append it
      if (!command.includes(folderPath)) {
        command = `${command} ${folderPath}`;
      }

      console.log(`Executing: ${command}`);

      const process = exec(command, { maxBuffer: 1024 * 1024 * 10 });

      // Stream stdout and stderr in real-time
      process.stdout.on('data', (data) => {
        console.log(data.toString());
      });

      process.stderr.on('data', (data) => {
        console.error(data.toString());
      });

      process.on('error', (err) => {
        console.error(`Error running tests:`, err.message);
        reject(err);
      });

      process.on('close', (code) => {
        if (code !== 0) {
          console.error(`Tests exited with code ${code}`);
          reject(new Error(`Tests failed with exit code ${code}`));
          return;
        }
        resolve();
      });
    });
    console.log('Tests completed successfully');
  } catch (error) {
    console.error('Test execution failed');
  }
};

// Main execution
const main = async () => {
  const args = parseArgs();
  const folderPath = args._[0];
  const configPath = args.config;

  console.log(`Using config from: ${configPath}`);
  const config = readConfig(configPath);

  // Debug information
  console.log(`Using jestRunner: "${config.jestRunner}"`);
  console.log(`Using reportPath: "${config.reportPath}"`);
  console.log(`Target folder path: "${folderPath}"`);

  // Phase 1: Convert fire-event to user-event
  await runPhase1FireEventToUserEvent(folderPath);

  // Run tests to collect caller info before Phase 2
  await runJestTests(config.jestRunner, folderPath);

  // Phase 2: Add clear commands where needed
  console.log(`Running Phase 2 with report from: ${config.reportPath}`);
  await runPhase2AddClear(config);

  // Phase 3: Migrate user.advancedType to user.type
  console.log('Running Phase 3: Migrate advancedType to type');
  await runPhase3AdvancedTypeToType(folderPath);

  console.log('All operations completed successfully');

  // Run tests again to ensure no regressions
  await runJestTests(config.jestRunner, folderPath);
};

// Call main function and handle errors
main().catch((error) => {
  console.error('Error during execution:', error);
  process.exit(1);
});
