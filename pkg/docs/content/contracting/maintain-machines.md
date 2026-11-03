# Maintain Machines

1. Switch to **Jedidiah Contracting** if you have access to both businesses, then open **Fleet → Machines**.
2. Search by Code or filter the **Category** column. **Active fleet** lists every Machine in service, and **Busy with** shows the customer and farm of the Job one is on site on; choose **Retired** to find a retired Machine.
3. Choose **New machine**. Enter its **Code**, choose or type its **Make** and **Model**, and select a **Category**. If no Category exists yet, add one in [Categories](./maintain-categories).
4. Choose **Save**. Codes display uppercase; a Code already used by another Machine is rejected regardless of letter case.
5. On the Machine's details, enter its registration, year, notes, and optional **Default Driver**, the Driver filled in each time the Machine is added to a Job. Drivers must already exist as people with the Contracting driver role; shared Device Accounts cannot be assigned. Clear **Default Driver** before changing that person’s role or marking them as a Device Account. **Serial number** and **John Deere** are filled by [linking the Machine to John Deere](./connect-john-deere#link-a-machine).
6. Copy the dash sticker's **Service interval** and **Next service due** hours when available. Leave unknown values blank. Set **Service alert hours** to be told earlier or later than the Service Due Soon threshold in [Settings](./maintain-contracting-settings) for this Machine; leave it blank to use Settings. Changes save automatically; resolve any validation or save error before leaving. After a service, [book and close the service](./book-a-service) instead: closing it sets Next service due. To keep the hours current from a meter value someone sends in, [capture a reading on the web](./capture-a-reading#on-the-web).
7. Open **Jobs** to list every Job the Machine has an Assignment on, planned or worked, newest first. Filter the **Stage** column to narrow it, and open a Job from its row.
8. To permanently withdraw a Machine, choose **Retire machine**, enter a **Retirement reason**, and choose **Retire**. Its history remains available, and it disappears from the active fleet and pickers. Retirement clears the default Driver and cannot be undone. A Machine in for a service cannot be retired until the service is closed.
9. Use **Delete machine** only for a never-used entry. If linked history blocks deletion, retire it instead.

## Change the Driver from the phone

1. Open the Machine in the phone's **Machines** tab and choose **Change driver**.
2. Pick the Machine's **Default Driver**, or **No driver** to clear it.
3. When the Machine is on site on a Job, **Also change the Driver on** that Job is on: the Machine's Assignment there takes the new Driver too. Turn it off to change only the default. If the Machine is on site on more than one Job, it is the Job it arrived on last.
4. Choose **Save**. If that Job no longer allows its Driver to change, the default still changes and the sheet says why.

Fleet changes require Contracting fleet management access. Other fleet readers can inspect details.
