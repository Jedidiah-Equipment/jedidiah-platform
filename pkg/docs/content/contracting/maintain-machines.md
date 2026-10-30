# Maintain Machines

1. Switch to **Jedidiah Contracting** if you have access to both businesses, then open **Fleet → Machines**.
2. Search by Code or filter the **Category** column. **Active fleet** lists every Machine in service, and **Busy with** shows the customer and farm of the Job one is on site on; choose **Retired** to find a retired Machine.
3. Choose **New machine**. Enter its **Code**, choose or type its **Make** and **Model**, and select a **Category**. If no Category exists yet, add one in [Categories](./maintain-categories).
4. Choose **Save**. Codes display uppercase; a Code already used by another Machine is rejected regardless of letter case.
5. On the Machine's details, enter its registration, year, notes, and optional **Current driver**. Drivers must already exist as people with the Contracting driver role; shared Device Accounts cannot be assigned. Clear **Current driver** before changing that person’s role or marking them as a Device Account. **Serial number** and **John Deere** are filled by [linking the Machine to John Deere](./connect-john-deere#link-a-machine).
6. Copy the dash sticker's **Service interval** and **Next service due** hours when available. Leave unknown values blank. Set **Service alert hours** to be told earlier or later than the Service Due Soon threshold in [Settings](./maintain-contracting-settings) for this Machine; leave it blank to use Settings. Changes save automatically; resolve any validation or save error before leaving. After a service, [book and close the service](./book-a-service) instead: closing it sets Next service due. To keep the hours current from a meter value someone sends in, [capture a reading on the web](./capture-a-reading#on-the-web).
7. Open **Jobs** to list every Job the Machine has an Assignment on, planned or worked, newest first. Filter the **Stage** column to narrow it, and open a Job from its row.
8. To permanently withdraw a Machine, choose **Retire machine**, enter a **Retirement reason**, and choose **Retire**. Its history remains available, and it disappears from the active fleet and pickers. Retirement clears the Current driver and cannot be undone. A Machine in for a service cannot be retired until the service is closed.
9. Use **Delete machine** only for a never-used entry. If linked history blocks deletion, retire it instead.

Fleet changes require Contracting fleet management access. Other fleet readers can inspect details.
