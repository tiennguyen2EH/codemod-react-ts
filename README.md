# Codemod user-event

This repository is designed to support the migration of user-event for specific folders within an application of Frontend-Core.

## Features

- Implementation file: [fire-event-to-user-event.ts](transforms/fire-event-to-user-event.ts)

## Installation

To use this script, ensure that you have the following installed on your system:

- [Node.js](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/) (for package management and running tests)

## Usage:

```bash
yarn migrate <absolute_folder_path>
```

Examples:

```bash
# migrate modules/employeeProfile
yarn migrate /Users/htien/dev/frontend-core/apps/hr-web-app/src/modules/employeeProfile
```
