# Manage Users

Only an Administrator or Super Administrator manages Users. **Users** in Equipment mode lists the people who
hold an Equipment role — and a Super Administrator, who spans both businesses — with their Departments. A person
who belongs to Jedidiah Contracting is managed under **Users** in Contracting mode instead; giving one person a
role in both businesses is a scripted change, not something the app offers.

## Adding an Equipment person

1. Click **New user** and enter the person's **Full Name**.
2. Select their **Equipment role**, replacing the default **Sales**. Only Equipment roles are offered. For a dedicated app review account, choose **App Store Tester**, which grants Product, Product Range, and Product Unit reads only.
3. Tick **Quote salesperson** if they sell, so Quotes can name them.
4. Select their **Departments** if they belong to any.
5. Enter their **Email** and a **Password**, then click **Create user**. A **Bay Operator** never signs in, so
   needs no email or password.

App Store Tester has no write permissions. Feedback submission is an existing exception available to every signed-in Equipment role; the role configuration alone does not block it.

## Letting someone be named on Quotes

1. Open the person in **Users** and tick **Quote salesperson**.
2. Click **Save user**. They now appear in the Salesperson picker on Quotes.

To remove them from the picker, open the person, untick **Quote salesperson**, and click **Save user**.
Their existing Quotes remain unchanged and can still be opened and saved.

## Removing access

1. Find the person with **Search users...** or use **Load more** to show the next users. Open their row and set **Equipment role** to **No access**.
2. Click **Save user**. A person who then holds no role in either business stays listed in both modes, so they
   can be given a role again later.

## Remove or disable a person

Open the person in **Users**. The dialog offers one of these at the bottom left:

- **Remove user** when nothing in the system names them yet, such as someone added twice by mistake. It deletes
  the account permanently.
- **Disable user** when they have history: Jobs, Checkouts, Quotes, Readings or anything they recorded. A
  disabled person cannot sign in, disappears from every person picker in both businesses, and keeps their name
  on everything they already did. **Users** shows them with a **Disabled** badge.
- **Enable user** on a disabled person, which reverses Disable.

Click the button and confirm. Neither is offered on your own account.

Removing or disabling is refused, with a sentence naming the fix, while the person still holds open work:

- the last Administrator who can sign in, or a Super Administrator when you are an Administrator;
- a Bay Operator still assigned to a Bay: unassign them from the Bay first;
- a Driver set as a Contracting Machine's driver: change the Machine's driver first;
- a Mechanic with Breakdowns not yet Fixed or open Service Records: reassign those first;
- the Foreman of an Upcoming or Active Job, or the Driver of a Machine Assignment on one: reassign them first.
