# Manage Users

Only a Super Administrator manages Users in Contracting mode, since no Contracting role carries user
administration. **Users** in Contracting mode lists the people who
hold a Contracting role — and a Super Administrator, who spans both businesses. A person who belongs to Jedidiah
Equipment is managed under **Users** in Equipment mode instead; giving one person a role in both businesses is a
scripted change, not something the app offers.

## Adding a contracting person

1. Click **New user** and enter the person's **Full Name**, and their **Phone number** if they have one.
2. Select their **Contracting role**: **Driver**, **Mechanic**, **Foreman**, **Contracting Manager**,
   **Workshop Manager**, **Contracting Invoicing**, or **Contracting Administrator** as appropriate. The default
   is **Foreman**, and only Contracting roles are offered.
3. For a Driver or Mechanic, that is all: they never sign in, so **Email**, **Email verified** and **Password**
   are hidden. Two people may share a name.
4. For any other role, enter their **Email** and a **Password**.
5. Click **Create user**.

## Removing access

1. Find the person with **Search users...** or use **Load more** to show the next users. Open their row and set **Contracting role** to **No access**.
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
