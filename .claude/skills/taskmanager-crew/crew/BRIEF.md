# ScrapHeap's request (from the customer)

We run Taskmanager for our own teams and we are comparing it with Asana. Two things stop
us moving over. Both are about **projects**:

## 1. A real project settings page

Today I can open a project and only rename it. I want a **Settings** place on every project
(team members only, never the customer's contacts) with these sections:

- **General**: name, description, colour, owner, status. Archive and delete (with a clear
  warning; archive is reversible).
- **Repositories**: link one or more GitHub repositories to the project, pick which is the
  default (the one `#123` means), and choose whether new links are internal or visible to
  the customer. This must show what is linked now and let me remove a repository.
- **Rules** (see below).
- **Custom fields**, which exist but live somewhere I did not find: show them here too.

## 2. Rules, like Asana's

"When *this* happens, do *that*", so nobody has to drag cards around by hand. Asana's model:

- **Triggers**: a task is added to the project; moved to a column; marked complete or
  reopened; assigned (to anyone, or to a particular person); the due date is set, changed,
  or passes; a comment is added; and (our addition, for developers) **a linked GitHub pull
  request is merged, closed, or its checks fail**.
- **Conditions** (optional, any number): the task is in a column, is assigned to X, has a
  label, has a due date, is internal or visible to the customer.
- **Actions**: move the task to a column; assign or unassign; set a due date (a number of
  days from now); mark complete or reopen; add a label; add a comment; create a subtask;
  change who can see the task.
- A rule has a **name**, an **on/off switch**, and a **log** of when it ran and what it did
  (and when it could not). Up to 50 rules per project.
- Rules must never run away: a rule's own change must not start a loop forever. If two rules
  keep triggering each other, stop them after a few steps and say so in the log.
- Examples I will try: "when a task is moved to Done, mark it complete and comment 'shipped'";
  "when a PR linked to a task is merged, move the task to Verify"; "when a task is added to
  Bugs, assign it to Wade"; "when a task is moved to In progress and has no assignee, assign
  it to whoever moved it".
- Rules also have to fire when work is done through the agent tools (MCP), not only when
  someone clicks in the browser.

## How we work together

- Pia Planner (PM) is my contact. I will not talk to the workers.
- I read the board; I can comment on shared tasks. The chat line is the `#scrapheap` channel:
  find me there (nick `scrappy`) when you need a meeting or a decision. Say `@scrappy`.
- I will try what you build, as myself, in a browser, and I will tell Pia what is wrong.
- Anything broken goes into the **Bugs** column. The Bugs column is also worked down: the
  team fixes its own bugs now.
- Nothing is done until I have seen it work.
