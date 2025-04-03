const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Function to find all *.ts and *.tsx files recursively, excluding spec and declaration files
const findTypeScriptFiles = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      // Recurse into subdirectory
      results = results.concat(findTypeScriptFiles(filePath));
    } else if (/\.(ts|tsx)$/.test(file) && !/\.(spec\.(ts|tsx)|d\.ts)$/.test(file)) {
      // Add file if it matches the pattern and is not a spec or declaration file
      results.push(filePath);
    }
  });

  return results;
};

// Main function to process the folder and execute the command
const runTypeScriptFiles = (folderPath, commandTemplate) => {
  const files = findTypeScriptFiles(folderPath);

  if (files.length === 0) {
    console.log('No TypeScript files found.');
    return;
  }

  console.log(`Found ${files.length} TypeScript files to process.`);

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
const commandTemplate =
  'yarn codemod -- --parser=tsx -t dist/date_time_formats/replace-legacy-format-function.js {file}';

if (!folderPath) {
  console.error('Please provide a folder path as the first argument.');
  process.exit(1);
}

if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
  console.error('The provided folder path is not valid.');
  process.exit(1);
}

// Run the script
console.log('Building codemod scripts...');
exec('yarn build', (err, stdout, stderr) => {
  if (err) {
    console.error('Error building codemod scripts:', err.message);
    process.exit(1);
  }

  if (stdout) {
    console.log(`Build output:\n${stdout}`);
  }

  console.log('Running codemod on TypeScript files...');
  runTypeScriptFiles(folderPath, commandTemplate);
});
