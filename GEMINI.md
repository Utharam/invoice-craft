# Standing Project Rules & Workflow Instructions

## 1. Versioning & Releases
* **Version Bumping on Major Changes**: Whenever making a major feature change, substantial architectural improvement, or defect remediation run, **always bump the project version** (e.g. in `package.json`, `package-lock.json`, and relevant documentation/headers) before committing and pushing to GitHub.
* Adhere to Semantic Versioning (`MAJOR.MINOR.PATCH`).
* Ensure all build artifacts (e.g. `bundle.js`, generated files) are re-compiled to reflect the updated version prior to pushing.

## 2. Local-First & Quality Standards
* Preserve offline-first, client-side zero-cloud dependency principles.
* Validate syntax (`node --check`) and execute project verification suites before every git push.
