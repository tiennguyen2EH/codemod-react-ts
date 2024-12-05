const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Function to find all *.spec.(ts|tsx) files recursively
const findSpecFiles = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      // Recurse into subdirectory
      results = results.concat(findSpecFiles(filePath));
    } else if (/\.(spec\.tsx)$/.test(file)) {
      // Add file if it matches the pattern
      results.push(filePath);
    }
  });

  return results;
};

// Main function to process the folder and execute the command
const runSpecFiles = (folderPath, commandTemplate) => {
  const files = findSpecFiles(folderPath);

  if (files.length === 0) {
    console.log('No spec files found.');
    return;
  }

  files.forEach((file) => {
    const command = commandTemplate.replace('{file}', file);
    console.log(`Executing: ${command}`);

    exec(command, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error executing ${file}:`, err.message);
      }
      if (stdout) {
        console.log(`Output for ${file}:\n${stdout}`);
      }
      if (stderr) {
        console.error(`Error Output for ${file}:\n${stderr}`);
      }
    });
  });
};

// Get folder path and command template from command-line arguments
const folderPath = process.argv[2];
const commandTemplate = 'yarn codemod -- --parser=tsx -t dist/fire-event-to-user-event.js {file}';

if (!folderPath) {
  console.error('Please provide a folder path as the first argument.');
  process.exit(1);
}

if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
  console.error('The provided folder path is not valid.');
  process.exit(1);
}

// Run the script
exec('yarn build', () => runSpecFiles(folderPath, commandTemplate));
