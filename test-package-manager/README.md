## This folder allows you test extension on different package managers

### You need to install npm yarn and pnpm

- `nvm install node` - for npm (haha)

- `npm install -g pnpm@latest-10` - for pnpm

- `npm install -g yarn` - for yarn

#### How to test
- launch "Run Extension" to open dev-version of vscode
- open `test-package-manager` folder as workspace
- try to start manually `test:{package}` script in any folder
- after that try to run it from taskbar

#### Test results
- in happy case you will see that each script uses it own package manager to run
- in bad case you will see that it each script in each folder use `npm` instead of required manager (so, we have a bug to fix)
