# Manage Users

Only an Administrator or Super Administrator creates Users, including contracting people. Open **Users** in Equipment mode.

## Adding contracting people

1. Click **New user** and enter the person's **Full Name**.
2. Enter their **Email**. For a non-login Driver or Mechanic, use a unique placeholder such as
   `firstname.lastname@people.jedidiah.local`; add a number if two people share a name.
3. Set **Equipment role** to **No access** for a contracting-only person, replacing the default **Sales**.
   Keep an Equipment Role only when the person also belongs to Equipment.
4. Select their **Contracting role**: **Driver**, **Mechanic**, **Foreman**, **Contracting Manager**,
   **Workshop Manager**, **Contracting Invoicing**, or **Contracting Administrator** as appropriate.
5. Enter a **Password**, using a randomly generated password for a non-login person. Email and password are
   required even for Drivers and Mechanics; a person whose only roles are permissionless cannot sign in.
6. Click **Create user**. Check that **Mode** reads **Contracting**, or **Both** if they also hold an Equipment Role.

## Find people by Mode

1. Open **Filter Mode** and select **Equipment**, **Contracting**, or **Both** to match that Mode exactly.
   **No access** finds Users with neither role. Drivers and Mechanics read **Contracting**; Bay Operators read
   **Equipment**; a Super Administrator reads **Both**.
2. Click a User to edit their details or roles.
3. Use **Clear Mode filter** to show all Modes again.
