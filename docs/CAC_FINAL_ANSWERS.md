# Clarity: Congressional App Challenge answer draft

Review these first-person answers for accuracy before submitting. Each narrative answer is below 400 words. These drafts do not certify eligibility, student authorship, video access or completed physical acceptance. The unknown-object feature is an experimental native appearance heuristic, not universal obstacle detection.

## Video demonstration link

Provided link: https://drive.google.com/drive/folders/13KxBeVbyVpJlJJ4-wnY-yigwEuwRCTLs?usp=sharing

**Before submitting:** This is a folder link, not a direct video link. Use the actual video's public viewing URL if possible. Verify that a signed-out viewer can play the complete video without requesting access. The folder title was reachable, but public video playback was not verified. Check the live contest instructions for permitted video hosts and length. Do not claim the video demonstrates newly added features unless it actually does.

## Please briefly describe what your app does

Clarity is a camera-based awareness prototype that highlights selected everyday objects and offers visual, sound, spoken and vibration cues. Users can start scanning, adjust detection and feedback settings, and stop the camera when finished.

The iPhone version runs a packaged object-detection model locally and can use compatible LiDAR hardware for approximate depth information. It also includes an experimental appearance-based fallback that looks for compact regions differing from the surrounding floor. These are labeled “Possible unknown object” rather than given an invented name or distance. Consistency checks reduce flickering detections, although shadows and floor patterns can still cause mistakes.

The browser version uses TensorFlow.js and COCO-SSD, with local inference by default and offline scanning after the required files have been cached. The native appearance fallback is not a browser feature.

Clarity explores different ways to present visual information. It can miss objects or produce incorrect warnings and is not a certified navigation or safety tool or a replacement for established mobility aids.

## What inspired you to create this app

I often see people in my community and at school walking with their attention on their phones. Sometimes they bump into another person or fail to notice something in their path. I have also been distracted by my phone while walking, so this was a problem I recognized in myself rather than just in other people.

Phones are not only a distraction. Students use them to check assignments, and other people rely on them for work, messages and news. I wondered whether the same device occupying our attention could also provide an additional awareness cue.

That led me to the camera. When I hold my phone while walking, it is often angled toward the area ahead of me. I wanted to explore whether it could identify some objects in view and communicate that information through more than a visual screen, including sound, speech and vibration.

Clarity grew from that question. My goal was not to make distracted walking safe or replace paying attention. It was to explore a practical use of a familiar device while learning where camera-based awareness works and where it fails.

## What technical difficulties did you face programming your app

One major challenge was balancing privacy with responsive detection. Processing camera frames locally avoids sending them to a detection server, but it also means working within the phone's processing and battery limits.

Another challenge was distinguishing recognition from awareness. A model trained on a fixed set of categories can miss an object completely. A high confidence threshold can also hide useful predictions. Testing the app on real objects exposed problems that a successful build or a single test image did not reveal.

For unclassified regions, floor appearance offered another signal, but color difference does not automatically mean an obstacle. Shadows, seams, rugs and changes in flooring can look similar. The experimental fallback therefore uses region size, surrounding appearance and consistency across frames, and labels its output as uncertain.

Platform restrictions created additional difficulties. LiDAR is not available on every device, depth measurements can be unreliable, and iOS controls background camera access and notification delivery. Handling permissions, stale results and interrupted scanning required as much attention as drawing detection boxes.

## What improvements would you make in version 2.0

My first priority would be stronger recognition backed by more realistic testing. I would evaluate different models and appropriately licensed training data across indoor and outdoor settings, lighting conditions, object sizes and camera angles. I would measure missed objects, incorrect alerts, latency and battery use rather than judging performance from a few successful examples.

I would also improve the distinction between objects and the surface underneath them by combining appearance, depth and motion where the hardware supports it. Same-colored objects, transparent objects and changing terrain remain difficult cases.

Accessibility would be another priority. I would work with people with differing visual, hearing, motor and sensory needs to evaluate the controls and feedback. Potential improvements include adjustable speech detail, distinguishable haptic patterns, larger controls and less overwhelming alerts.

Finally, I would improve consistency across devices and communicate more clearly when a capability is unavailable or unreliable. A useful second version should make uncertainty easier to understand, not simply produce more warnings.

## Did you use AI

Yes.

## How did you use AI, and what did you contribute directly

I used Jcode, with OpenAI and Anthropic Claude models, for interface suggestions, code generation, debugging, automated tests, documentation, and assistance setting up and evaluating model-training experiments. AI assistance also helped investigate camera performance, notification behavior and the experimental unknown-object fallback. The app itself uses pretrained computer-vision models to recognize supported object categories.

My direct contributions included the use case and intended experience, choices about features and feedback, and repeated testing on my iPhone. I identified failures involving notifications, slow recognition, missed chairs and backpacks, and small unclassified items. I used those observations to direct revisions and specified that the fallback should work across different colors rather than be tailored to one example.

The project also builds on earlier collaborative work, open-source software and pretrained models, which should be credited separately. I am not claiming that I independently wrote every line of code or trained the underlying models from scratch. AI-generated changes still require human review, testing and an understanding of their limitations.

**Review note, not for the answer box:** Add any other AI tools actually used. Keep only contributions you personally made and can explain. Review inherited-work attribution and the contest's student-contribution requirements before certifying the application.

## What did you learn or take away from participating

I learned that making an app run is different from making it useful in real conditions. A model can recognize an object in a test image and still miss a similar object through a moving phone camera. Likewise, code can compile successfully while permissions or operating-system restrictions prevent a feature from working as expected.

Testing Clarity taught me to separate several questions: Did the camera capture a fresh frame? Did the model recognize anything? Did a confidence setting hide the result? Was the warning delivered? Looking at each step made problems easier to understand than assuming the model alone was responsible.

I also learned that accessibility involves choices, not just adding a sound or changing a color. Different users may need different controls and levels of feedback, and those choices need testing with the people they are intended to help.

My biggest takeaway is the importance of honest iteration: observe what actually happens, acknowledge limitations, and improve the result without claiming more than the evidence supports.

## Remaining form fields

- Project link: https://github.com/yashthakur2008/clarityCongressionalAppChallenge
- Cover photo: confirm the uploaded image is the intended one. Prefer an actual, readable app screenshot with relevant functionality, not fabricated detections. The requested format is JPEG, approximately 600 × 800 pixels (3:4).
- Coding location: select where you actually did most of the work. The supplied form text does not establish which option was selected.
- Completion date: use your actual final coding date in local time. The changes in this session occurred on October 26, 2026 PDT, although logs use October 27 UTC. Do not backdate later work.
- School/organization, mentor and ambassador: answer only from your own circumstances. Do not invent names or contact information.
- Certification opt-in: retain your choice if you want to participate.
- Application ready to submit: select Yes only after you have checked the public video, reviewed every answer and disclosure, confirmed applicable eligibility/deadline requirements, and are ready to submit. No submission has been made by this assistant.
