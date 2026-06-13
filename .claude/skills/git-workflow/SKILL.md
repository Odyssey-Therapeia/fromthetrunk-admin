---
name: git-workflow
description: Git workflow best practices including commit strategies, branching models, and collaboration patterns. Use when performing git operations — committing, branching, merging, rebasing, creating PRs, resolving conflicts, or managing releases. Also use when discussing version control strategy or reviewing git history.
---

# Git Workflow Best Practices

## Commit Strategies

- **Atomic Commits:** Keep commits small and focused. Each commit should address a single, logical change. This makes history easier to understand and revert.
- **Descriptive Commit Messages:** Write clear, concise, and informative commit messages. Explain the *why* behind the change, not just *what* was changed. Use imperative mood: "Fix bug", "Add feature".
- **Commit Frequently:** Commit early and often to avoid losing work and make progress easier to track.
- **Avoid Committing Broken Code:** Ensure code compiles and passes basic tests before committing.
- **Sign Your Commits (Optional but Recommended):** Use GPG signing to verify the authenticity of commits.

## Branching Model

- **Use Feature Branches:** Create branches for each new feature or bug fix. This isolates changes and allows for easier code review.
- **Short-Lived Branches:** Keep branches short-lived. The longer a branch exists, the harder it becomes to merge.
- **Regularly Rebase or Merge:** Keep feature branches up-to-date with the main branch by rebasing or merging regularly.
- **Avoid Direct Commits to Main Branch:** Protect the main branch from direct commits. Use pull requests for all changes.

## Code Organization

- **Consistent Formatting:** Use a consistent coding style guide and enforce it with linters and formatters.
- **Modular Code:** Break down the codebase into smaller, manageable modules or components for readability, maintainability, and testability.
- **Well-Defined Interfaces:** Define clear interfaces between modules and components to promote loose coupling.
- **Avoid Global State:** Minimize the use of global variables and state to reduce complexity and potential conflicts.

## Collaboration and Code Review

- **Pull Requests:** Use pull requests for all code changes. This provides an opportunity for code review and discussion.
- **Code Review Checklist:** Maintain a code review checklist to ensure consistency and thoroughness.
- **Constructive Feedback:** Focus on improving the code, not criticizing the author.
- **Address Feedback Promptly:** Respond to and address feedback from code reviews quickly.

## Ignoring Files

- **.gitignore:** Use a `.gitignore` file to exclude files and directories that should not be tracked (build artifacts, temporary files, secrets).
- **Global .gitignore:** Configure a global `.gitignore` for files you never want tracked in any repository.

## Secrets and Sensitive Information

- **Never Commit Secrets:** Never commit secrets, passwords, API keys, or other sensitive information.
- **Environment Variables:** Store secrets in environment variables and access them at runtime.
- **Secret Management Tools:** Use tools like HashiCorp Vault or cloud-native secret managers for production secrets.

## Large File Storage (LFS)

- **Use for Large Files:** Use Git LFS for storing large files (images, videos, audio). This prevents repository bloat.
- **Configure LFS:** Configure Git LFS properly to track the large files in your repository.

## Reverting and Resetting

- **Understand the Differences:** Know the differences between `git revert`, `git reset`, and `git checkout` before using them.
- **Use with Caution:** Use `git reset` and `git checkout` with caution as they can potentially lose data.
- **Revert Public Commits:** Use `git revert` to undo changes that have already been pushed. This creates a new commit that reverses the changes.

## Tagging Releases

- **Create Tags:** Create tags to mark significant releases or milestones.
- **Semantic Versioning:** Follow semantic versioning (SemVer) when tagging releases.
- **Annotated Tags:** Use annotated tags to provide additional information about the release.

## Merge Conflicts

- **Understand the Conflict:** Understand the source of the merge conflict before attempting to resolve it.
- **Communicate:** Communicate with other developers who may be affected by the conflict.
- **Use a Merge Tool:** Use a merge tool to help resolve the conflict.
- **Test After Resolving:** Test code thoroughly after resolving a conflict.

## CI/CD Integration

- **Automate Testing:** Integrate Git with a CI/CD system to automate testing and deployment.
- **Run Tests on Every Commit:** Run tests on every commit to ensure code quality.

## Repository Maintenance

- **Regularly Clean Up:** Regularly clean up the Git repository by removing unused branches and tags.
- **Optimize:** Optimize the repository with `git gc` to improve performance.
