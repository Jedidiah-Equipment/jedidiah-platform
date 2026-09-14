# Manage Users

Only an Administrator or Super Administrator manages Users. **Users** in Contracting mode lists the people who
hold a Contracting role — and a Super Administrator, who spans both businesses. A person who belongs to Jedidiah
Equipment is managed under **Users** in Equipment mode instead; giving one person a role in both businesses is a
scripted change, not something the app offers.

## Adding a contracting person

1. Click **New user** and enter the person's **Full Name**.
2. Enter their **Email**. For a non-login Driver or Mechanic, use a unique placeholder such as
   `firstname.lastname@people.jedidiah.local`; add a number if two people share a name.
3. Select their **Contracting role**: **Driver**, **Mechanic**, **Foreman**, **Contracting Manager**,
   **Workshop Manager**, **Contracting Invoicing**, or **Contracting Administrator** as appropriate. The default
   is **Foreman**, and only Contracting roles are offered.
4. Enter a **Password**, using a randomly generated password for a non-login person. Email and password are
   required even for Drivers and Mechanics; a person whose only roles are permissionless cannot sign in.
5. Click **Create user**.

## Removing access

1. Open the person from the list and set **Contracting role** to **No access**.
2. Click **Save user**. A person who then holds no role in either business stays listed in both modes, so they
   can be given a role again later.
