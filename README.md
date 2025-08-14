# YouClicker

This simple web application will be used in a classroom setting.  A teacher will be able to sign in using a special access code, and create a class "session" which will hold a list of questions with multiple choice answers.  When ready, the teacher will present a QR code and students will scan it with their mobile devices in order to bring them to the URL (which contains a long uuid for obscurity)

The student's phone will register as an "student-XXXX" user and the teacher's screen will update the number of connected students.  Then, once ready, the teacher will move through each question and allow the students to select their answer.  The student's screen should show 4-5 buttons, the text of which should be the proposed answer.

As students answer, the teacher's screen will update with the number of answers submitted, and will have the option to reveal the tally of submissions under each answer.  The class will then discuss and the cycle will repeat.

---

This application is part of the `rapidresponder` suite of tools for Fire Agencies.

This application will be published on a VPS under the subdomain youclick.rapidresponder.site.

A Caddyfile should be created for use with Caddy reverse-proxy.

Teacher's should go to youclick.rapidresponder.site and enter the access code contained in the `.env` file.  They can then create and name a class session.  Then, they'll be presented with a simple interface for entering the text of the question and possible multiple-choice answers, selecting one or more as correct.

When the teacher selects "Present this class" it will generate a unique UUID for the session and allow students to connect via youclick.rapidresponder.site/session/UUID

When a student visits the site it will show their unique "student-XXXX" ID and it will display a ready screen.  Once the teacher starts the class and displays the first test question, the student's display will move along.  Perhaps we need web sockets to keep the students in sync?