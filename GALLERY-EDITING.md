# Photo editing

The gallery is configured for [Pages CMS](https://app.pagescms.org/), a visual editor for the GitHub repository. Keep this dashboard bookmarked on your phone. No editor link is shown on the public website.

After connecting Pages CMS to **diogo-poeta/lumefern**:

1. Open **Photo gallery** and expand a photo to edit it, or add a new photo.
2. Upload or select its picture, enter the title and caption, and choose **Research** or **Travel**.
3. Confirm permission to display the picture. New photos start as **Draft**, hidden from the website.
4. Choose **Published** when ready and save. Saving updates GitHub; the existing Pages deployment updates the website shortly afterward.

You can also replace a picture, edit its image description and credit, reorder the photos, or change a published photo back to Draft to hide it. No JSON editing or pixel measurements are required.

The CMS connection is a separate GitHub App permission grant. Limit its installation to **lumefern**. The `.pages.yml` file configures the editor; it contains no credentials and grants no access by itself.
