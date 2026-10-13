**FULL-STACK APPLICATION**  
**BEST PRACTICES GUIDE**

**React \+ REST API \+ MongoDB Atlas \+ Git \+ AWS**

*A practical review checklist for student full-stack projects*

| Audience | Students building and deploying full-stack web applications |
| :---- | :---- |
| Goal | Improve security, maintainability, performance, reliability, usability and deployment quality |

# **1\. How to Use This Guide**

Use this document as a code-review checklist before submitting, demonstrating or deploying your application. For every practice, review your code and ask whether the example or an equivalent approach is present.

* REST API design and error handling  
* React component design, state management and rendering  
* Validation and data integrity  
* Authentication, authorization and common web security risks  
* Secrets, environment variables and configuration  
* Performance, optimization and network efficiency  
* MongoDB Atlas data modeling, indexes and query practices  
* Git workflow, commits, branches and repository hygiene  
* AWS deployment and cloud security/reliability  
* UI/UX, accessibility and responsive design  
* Time and space complexity  
* Logging, monitoring, testing and production readiness

# **2\. Recommended Full-Stack Architecture**

Keep responsibilities separated. The frontend should handle presentation and user interaction; the backend should enforce business rules, authentication and validation; the database should persist data.

React UI  
   |  
   | HTTPS / JSON  
   v  
REST API (Node/Express or equivalent)  
   |  
   | Database driver / ODM  
   v  
MongoDB Atlas

Supporting services:  
Git/GitHub \-\> CI/CD \-\> AWS  
Environment variables / Secrets \-\> runtime configuration  
Logging / Monitoring \-\> operational visibility

* Do not allow the React application to connect directly to MongoDB Atlas.  
* Keep database credentials and server-side secrets only on the backend.  
* Use HTTPS in deployed environments.  
* Keep business logic out of React components when it belongs in the API/service layer.  
* Use clear boundaries between routes/controllers, services, validation and data-access code.

# **3\. REST API Best Practices**

## **3.1 Use Resource-Oriented URLs**

Use nouns for resources and HTTP methods to describe the action. Avoid URLs such as /getUsers or /deleteUser.

**Why it matters:** Consistent API design makes APIs easier to understand, test and maintain.

**Example:**

GET    /api/users  
GET    /api/users/123  
POST   /api/users  
PUT    /api/users/123  
PATCH  /api/users/123  
DELETE /api/users/123

## **3.2 Use Appropriate HTTP Status Codes**

Return status codes that describe the result of the request instead of always returning 200\.

**Example:**

201 Created   \-\> resource successfully created  
200 OK        \-\> successful read/update  
204 No Content \-\> successful delete with no response body  
400 Bad Request \-\> invalid request  
401 Unauthorized \-\> authentication is missing/invalid  
403 Forbidden \-\> authenticated but not allowed  
404 Not Found \-\> resource does not exist  
409 Conflict \-\> duplicate/conflicting operation  
500 Internal Server Error \-\> unexpected server failure

## **3.3 Return Consistent Error Responses**

Clients should receive a predictable error structure so the React application can display useful messages.

**Example:**

{  
  "success": false,  
  "error": {  
    "code": "VALIDATION\_ERROR",  
    "message": "Email address is invalid",  
    "fields": {  
      "email": "Enter a valid email address"  
    }  
  }  
}

## **3.4 Validate Request Data on the Server**

Never trust data simply because the React UI validates it. Server-side validation is mandatory because API clients can bypass the UI.

**Why it matters:** Attackers and other clients can call your REST API directly.

**Example:**

// Example concept  
if (\!email || \!email.includes("@")) {  
  return res.status(400).json({  
    success: false,  
    message: "Valid email is required"  
  });  
}

## **3.5 Avoid Overly Broad Endpoints**

Return only the data the client needs. Avoid returning entire database documents when a smaller response is sufficient.

**Why it matters:** Smaller responses reduce data exposure and network overhead.

**Example:**

// Prefer  
GET /api/users/123

{  
  "id": "123",  
  "name": "Asha",  
  "email": "asha@example.com"  
}

// Avoid exposing internal fields such as passwordHash, resetToken, etc.

## **3.6 Add Pagination for Large Collections**

Do not return thousands of records in a single request. Use page/limit or cursor-based pagination.

**Why it matters:** Pagination improves response time, memory usage and user experience.

**Example:**

GET /api/products?page=1\&limit=20

Response:  
{  
  "items": \[ ... \],  
  "page": 1,  
  "limit": 20,  
  "total": 245  
}

## **3.7 Centralize Error Handling**

Use a common error-handling middleware instead of repeating try/catch response logic in every route.

**Example:**

app.use((err, req, res, next) \=\> {  
  console.error(err);  
  res.status(err.statusCode || 500).json({  
    success: false,  
    message: "An unexpected error occurred"  
  });  
});

# **4\. React Best Practices**

## **4.1 Build Small, Reusable Components**

A component should have a clear responsibility. Break large pages into reusable components.

**Why it matters:** Smaller components are easier to test, debug and reuse.

**Example:**

\<UserPage\>  
  \<UserHeader /\>  
  \<UserSearch /\>  
  \<UserList /\>  
  \<Pagination /\>  
\</UserPage\>

## **4.2 Keep State as Local as Practical**

Do not put every piece of state into global state. Keep state close to the components that use it.

**Example:**

function SearchBox() {  
  const \[query, setQuery\] \= useState("");  
  // query belongs to this component  
}

## **4.3 Avoid Unnecessary useEffect**

useEffect is for synchronizing with external systems such as APIs, subscriptions or browser APIs. Do not use it for calculations that can happen during rendering.

**Why it matters:** Unnecessary effects can cause extra renders, complicated data flow and bugs.

**Example:**

// Prefer  
const fullName \= firstName \+ " " \+ lastName;

// Rather than an effect just to calculate fullName.

## **4.4 Handle Loading, Error and Empty States**

Every API-driven screen should consider loading, success, error and no-data states.

**Example:**

if (loading) return \<Spinner /\>;  
if (error) return \<ErrorMessage /\>;  
if (users.length \=== 0\) return \<EmptyState /\>;

return \<UserList users={users} /\>;

## **4.5 Use Stable Keys in Lists**

Use a unique, stable identifier from the data rather than array indexes when list items can change.

**Example:**

users.map(user \=\> (  
  \<UserCard key={user.id} user={user} /\>  
))

## **4.6 Avoid Prop Drilling Where It Becomes Excessive**

If the same state must pass through many unrelated components, consider context or a state-management solution. Do not introduce global state simply because it exists.

**Example:**

\<AuthProvider\>  
  \<App /\>  
\</AuthProvider\>

// Components can access authentication context  
// without passing user data through every intermediate component.

# **5\. Security Best Practices**

Security must be enforced primarily on the server. Frontend restrictions improve user experience but are not security controls.

## **5.1 Never Store Secrets in React Source Code**

Anything shipped to a browser can be inspected by the user. Never put database passwords, private API keys or signing secrets in React code.

**Why it matters:** Frontend code is public to the browser.

**Example:**

// BAD  
const mongoPassword \= "MySecretPassword";

// GOOD  
// Server-side only:  
const mongoUri \= process.env.MONGODB\_URI;

## **5.2 Use Environment Variables Correctly**

Use environment variables for configuration, but understand that frontend environment variables are usually bundled into the browser and therefore are not secret.

**Example:**

Backend:  
MONGODB\_URI=...  
JWT\_SECRET=...

Frontend:  
VITE\_API\_BASE\_URL=https://api.example.com

Rule:  
VITE\_API\_BASE\_URL \-\> configuration, not a secret  
JWT\_SECRET        \-\> secret; backend only

## **5.3 Protect Authentication and Authorization**

Authentication answers 'who are you?' Authorization answers 'what are you allowed to do?'. Check permissions on the backend for every protected operation.

**Example:**

// Example rule  
if (req.user.role \!== "admin") {  
  return res.status(403).json({  
    message: "Forbidden"  
  });  
}

## **5.4 Hash Passwords; Never Store Plaintext Passwords**

Passwords should be hashed with a modern password-hashing algorithm such as Argon2 or bcrypt, with appropriate parameters.

**Why it matters:** A database leak must not expose users' original passwords.

**Example:**

// Conceptual example  
const passwordHash \= await bcrypt.hash(password, 12);

// Store passwordHash, never the original password.

## **5.5 Protect Against Injection**

Use parameterized queries or safe ODM/query APIs. Never construct database queries by blindly concatenating user input.

**Why it matters:** Untrusted input can manipulate database operations.

**Example:**

// Prefer safe query construction  
User.findOne({ email: req.body.email });

// Validate and constrain input before using it in queries.

## **5.6 Configure CORS Carefully**

Allow only the origins that need to call the API. Avoid allowing every origin in production unless there is a specific reason.

**Example:**

// Conceptual production configuration  
cors({  
  origin: \["https://www.example.com"\],  
  credentials: true  
})

## **5.7 Add Rate Limiting to Sensitive Endpoints**

Login, password-reset and other abuse-prone endpoints should have rate limits and monitoring.

**Example:**

// Conceptual  
POST /api/auth/login  
\-\> rate limit repeated attempts  
\-\> log suspicious activity  
\-\> return generic authentication errors

## **5.8 Do Not Leak Internal Errors**

Log detailed errors on the server, but return safe messages to clients.

**Example:**

Server log:  
MongoServerError: duplicate key index users.email

Client response:  
{  
  "message": "An account with this email already exists."  
}

# **6\. Validation and Data Integrity**

## **6.1 Validate at Multiple Layers**

Client-side validation provides immediate feedback. Server-side validation provides security and correctness. Database constraints/indexes provide an additional integrity layer.

**Example:**

React:  
  email is required

API:  
  email must be valid

Database:  
  email has a unique index where appropriate

## **6.2 Normalize and Constrain Data**

Store data consistently. For example, trim emails and apply a consistent case policy before comparing or storing them.

**Example:**

const email \= req.body.email.trim().toLowerCase();

## **6.3 Validate File Uploads**

If the application accepts files, validate type, size and content on the server. Do not trust only the filename or browser-provided MIME type.

**Example:**

Allowed: PDF, max 5 MB  
Reject: executable files, oversized files, unexpected content  
Store uploads outside executable application directories.

# **7\. MongoDB Atlas Best Practices**

## **7.1 Design Documents Around Access Patterns**

MongoDB schema design should reflect how the application reads and writes data. Embed related data when appropriate; reference when relationships or document size make that more suitable.

**Example:**

// Example embedded profile  
{  
  "name": "Asha",  
  "address": {  
    "city": "Waterloo",  
    "postalCode": "N2L..."  
  }  
}

## **7.2 Create Indexes for Frequent Queries**

Indexes can dramatically improve lookup performance, but too many indexes increase storage and write overhead.

**Example:**

// Example  
db.users.createIndex({ email: 1 }, { unique: true })

// Add indexes based on real query patterns, not every field.

## **7.3 Return Only Required Fields**

Projection reduces data transferred from the database and processed by the application.

**Example:**

db.users.find(  
  { active: true },  
  { name: 1, email: 1 }  
)

## **7.4 Avoid Unbounded Queries**

Always consider limits, pagination and filters. A query that works with 50 records may become slow with 500,000.

**Example:**

find({ status: "active" })  
  .sort({ createdAt: \-1 })  
  .limit(20)

# **8\. Performance, Speed and Optimization**

## **8.1 Minimize Network Calls**

Combine related data requests when appropriate, cache stable data, and avoid requesting the same resource repeatedly.

**Example:**

// Avoid repeated GET /api/profile calls  
// Store the fetched profile in appropriate component/context/query state  
// and refetch only when required.

## **8.2 Debounce Search Inputs**

For search boxes that call an API, wait briefly after typing stops before sending the request.

**Example:**

User types: "lap..."  
Instead of 3 API calls:  
l \-\> la \-\> lap

Use a debounce, for example 300–500 ms,  
then call:  
GET /api/products?search=laptop

## **8.3 Optimize Images and Static Assets**

Use appropriately sized images, modern formats where supported, lazy loading and compression.

**Example:**

\<img  
  src="/images/product.webp"  
  alt="Laptop"  
  loading="lazy"  
/\>

## **8.4 Avoid Rendering Work You Do Not Need**

Keep component state focused, avoid unnecessary calculations and use memoization only when measurement shows it helps.

**Example:**

// Expensive calculation example  
const result \= useMemo(  
  () \=\> calculateLargeReport(data),  
  \[data\]  
);

// Do not add useMemo everywhere automatically.

## **8.5 Cache Carefully**

Cache data that is safe to reuse and has a known freshness strategy. Define when cached data becomes stale.

**Example:**

Example:  
Product categories \-\> cache longer  
Current account balance \-\> fetch/refresh according to business requirements

# **9\. Time and Space Complexity**

Big-O notation describes how an algorithm's time or memory requirements grow as input size increases. Students should be able to explain the complexity of important loops, searches and data-processing functions.

| Complexity | Example | Typical interpretation |
| :---- | :---- | :---- |
| O(1) | Access array element by index | Constant |
| O(log n) | Binary search in sorted data | Grows slowly |
| O(n) | Single loop through n items | Linear |
| O(n log n) | Efficient comparison sorting | Common for efficient sorting |
| O(n²) | Nested loops over same n items | Can become expensive quickly |

## **9.1 Avoid Accidental O(n²) Logic**

Nested loops are not always wrong, but check whether a lookup can be replaced with a Map/Set or database query.

**Example:**

// Potentially O(n²)  
for (const user of users) {  
  for (const order of orders) {  
    if (order.userId \=== user.id) { ... }  
  }  
}

// Consider building a Map keyed by userId  
// so lookups are approximately O(1) on average.

## **9.2 Consider Space Complexity**

Performance is not only about CPU time. Large arrays, duplicated objects and unnecessary response data consume memory.

**Example:**

// Prefer processing/paginating 20,000 records  
// instead of loading all 20,000 into memory when only 20 are displayed.

# **10\. Git and Repository Best Practices**

## **10.1 Use Meaningful Commits**

A commit should describe one logical change. Avoid messages such as 'changes' or 'final final'.

**Example:**

feat: add user registration API  
fix: handle duplicate email validation  
refactor: move database logic into user service  
docs: update deployment instructions

## **10.2 Use a .gitignore**

Exclude dependencies, local environment files, build output, logs and other machine-specific files.

**Example:**

.env  
node\_modules/  
dist/  
build/  
coverage/  
\*.log  
.DS\_Store

## **10.3 Never Commit Secrets**

If a secret is accidentally committed, deleting the file later is not enough because it may remain in Git history. Rotate/revoke the secret immediately.

**Example:**

BAD:  
git add .env  
git commit \-m "config"

GOOD:  
.env is ignored  
.env.example contains only safe placeholders

MONGODB\_URI=\<your-mongodb-uri\>

## **10.4 Keep README Useful**

A reviewer should be able to understand and run the project from the README.

**Example:**

README should include:  
1\. Project overview  
2\. Architecture  
3\. Prerequisites  
4\. Local setup  
5\. Environment variables  
6\. Run commands  
7\. API endpoints  
8\. Test commands  
9\. Deployment information  
10\. Known limitations

## **10.5 Review Before Merging**

Check tests, security, error handling, formatting, documentation and accidental secrets before merging changes.

**Example:**

Pull Request checklist:  
\[ \] Tests pass  
\[ \] No secrets  
\[ \] Validation added  
\[ \] Error handling checked  
\[ \] API documented  
\[ \] UI tested on mobile/desktop  
\[ \] README updated

# **11\. AWS and Cloud Deployment Best Practices**

## **11.1 Use Least Privilege IAM**

Give users, applications and services only the AWS permissions they actually need.

**Why it matters:** A compromised credential with excessive permissions can cause much greater damage.

**Example:**

Example:  
A frontend deployment process that only uploads to one S3 bucket  
should not have administrator permissions across the AWS account.

## **11.2 Separate Environments**

Keep development/test and production configuration separate.

**Example:**

Development:  
API \-\> https://dev-api.example.com  
Database \-\> development database

Production:  
API \-\> https://api.example.com  
Database \-\> production database

## **11.3 Do Not Expose Internal Services**

Database services should not be publicly reachable merely for convenience. Restrict network access and use authentication, encryption and allowlists/security controls as appropriate.

**Example:**

Browser \-\> public HTTPS API \-\> private/restricted database access

Avoid:  
Browser \-\> directly exposed MongoDB Atlas credentials

## **11.4 Monitor Costs and Resources**

Set budgets/alerts and review resources regularly. Delete unused test resources and avoid leaving expensive resources running unnecessarily.

**Example:**

Monthly review:  
\- Compute usage  
\- Storage  
\- Data transfer  
\- Logs  
\- Databases  
\- Unused IPs/resources  
\- CI/CD usage

## **11.5 Use HTTPS and Secure Headers**

Production web applications should use HTTPS and appropriate HTTP security headers.

**Example:**

Examples:  
Strict-Transport-Security  
Content-Security-Policy  
X-Content-Type-Options  
Referrer-Policy

Configure according to your hosting platform and application needs.

# **12\. UI/UX and Accessibility Best Practices**

## **12.1 Make the UI Responsive**

The application should remain usable on desktop, tablet and mobile screens.

**Example:**

Use responsive CSS:  
.container {  
  width: min(100% \- 2rem, 1200px);  
  margin: auto;  
}

@media (max-width: 768px) {  
  /\* mobile layout adjustments \*/  
}

## **12.2 Use Clear Forms**

Labels, validation messages, required indicators and error messages should help users complete forms successfully.

**Example:**

\<label htmlFor="email"\>Email address\</label\>  
\<input id="email" name="email" type="email" required /\>

// Show a specific message:  
"Enter a valid email address."  
instead of:  
"Invalid input." 

## **12.3 Design for Accessibility**

Use semantic HTML, keyboard navigation, sufficient contrast, labels and meaningful alternative text.

**Example:**

\<button type="submit"\>Create Account\</button\>

\<img  
  src="/images/logo.png"  
  alt="Student Portal"  
/\>

## **12.4 Provide User Feedback**

Users should know when an operation is running, succeeded or failed.

**Example:**

Save button states:  
\[Save\]  
\[Saving...\]  
\[Saved\]

On failure:  
"Unable to save your profile. Please try again." 

# **13\. Testing Best Practices**

## **13.1 Test the API Independently**

Use tools such as Postman, curl or automated tests to test the REST API without relying on the React UI.

**Example:**

POST /api/users  
Input:  
{  
  "name": "Asha",  
  "email": "asha@example.com"  
}

Verify:  
\- 201 status  
\- response body  
\- database record  
\- duplicate email behavior  
\- invalid input behavior

## **13.2 Test Negative Cases**

Good applications test failure conditions, not only successful cases.

**Example:**

Test:  
\- missing required fields  
\- invalid email  
\- duplicate record  
\- invalid ID  
\- unauthorized request  
\- forbidden role  
\- database unavailable  
\- malformed JSON  
\- very large input

## **13.3 Test Important Business Rules**

Automated tests should protect important logic such as calculations, permissions, validation and data transformations.

**Example:**

describe("credit score", () \=\> {  
  it("rejects values outside the allowed range", () \=\> {  
    // assertion  
  });  
});

# **14\. Logging, Monitoring and Observability**

## **14.1 Log Useful Events**

Logs should help diagnose problems without exposing passwords, tokens or other sensitive information.

**Example:**

Log:  
request ID  
HTTP method  
route  
status code  
duration  
important business event

Do NOT log:  
passwords  
access tokens  
database passwords  
full credit-card numbers

## **14.2 Measure API Response Time**

Track slow endpoints and investigate database queries, network calls and application logic.

**Example:**

Example log:  
GET /api/orders  
status=200  
duration=820ms

A consistently slow endpoint should be investigated rather than hidden.

# **15\. Configuration and Environment Management**

## **15.1 Keep Configuration Separate from Code**

Use environment-specific configuration for URLs, ports and credentials.

**Example:**

Development:  
PORT=3000  
VITE\_API\_BASE\_URL=http://localhost:5000/api

Production:  
PORT=3000  
VITE\_API\_BASE\_URL=https://api.example.com/api

## **15.2 Provide an .env.example**

Show developers which variables are required without exposing real values.

**Example:**

\# .env.example  
PORT=5000  
MONGODB\_URI=\<set-this-locally\>  
JWT\_SECRET=\<set-this-locally\>  
CLIENT\_URL=http://localhost:5173

# **16\. Code Quality and Maintainability**

* Use clear variable, function, component and route names.  
* Avoid duplicated business logic; extract reusable functions/services.  
* Keep functions focused on one responsibility where practical.  
* Remove dead code, unused imports, debug statements and commented-out experiments.  
* Use a formatter and linter consistently.  
* Document non-obvious business rules and architectural decisions.  
* Prefer readable code over clever code.  
* Handle asynchronous operations and errors explicitly.

## **16.1 Separate Layers in the Backend**

A common structure is routes \-\> controllers \-\> services \-\> data access. The exact structure can vary, but responsibilities should be clear.

**Example:**

routes/userRoutes.js  
    \-\> userController.js  
       \-\> userService.js  
          \-\> userRepository.js / MongoDB

This prevents route files from becoming large blocks of business and database logic.

# **17\. Production Readiness Checklist**

* ☐ Application runs locally from documented steps.  
* ☐ Production build completes successfully.  
* ☐ No secrets are committed to Git.  
* ☐ Environment variables are configured correctly.  
* ☐ MongoDB Atlas access is restricted appropriately.  
* ☐ API validates all client-controlled input.  
* ☐ Authentication and authorization are enforced server-side.  
* ☐ CORS is restricted appropriately.  
* ☐ API has consistent status codes and error responses.  
* ☐ Large collections use pagination.  
* ☐ Important database queries have appropriate indexes.  
* ☐ React has loading, error and empty states.  
* ☐ UI works on mobile and desktop.  
* ☐ Basic accessibility has been reviewed.  
* ☐ API and important business logic have tests.  
* ☐ Logging is available without leaking sensitive information.  
* ☐ AWS IAM follows least privilege.  
* ☐ AWS cost/budget monitoring is configured where appropriate.  
* ☐ HTTPS is enabled for production traffic.  
* ☐ README explains setup, environment variables, testing and deployment.

# **18\. Student Self-Review Exercise**

Before considering your project complete, review one feature end-to-end. For example, choose 'Create User' and trace it from the browser to the database.

* React form: Are fields labeled and validated?  
* React request: Is the API URL configuration-driven?  
* API route: Is the HTTP method and URL appropriate?  
* API validation: Can a malicious client bypass the UI validation?  
* Authorization: Is the user allowed to perform this operation?  
* Service/business logic: Is business logic separated from routing?  
* Database: Is the data model appropriate and indexed where needed?  
* Error handling: What happens if MongoDB is unavailable?  
* Security: Could any secret or sensitive field be exposed?  
* Performance: How many network/database calls occur?  
* Complexity: What is the time/space complexity of the important processing?  
* Logging: Could the team diagnose a failure from logs?  
* Deployment: Does the same feature work in the deployed AWS environment?

# **19\. Quick Reference: Good vs. Risky Practices**

| Prefer | Avoid |
| :---- | :---- |
| Server-side validation | Trusting only React validation |
| Environment variables / secret manager | Hard-coded passwords or API secrets |
| Parameterized/safe queries | Building queries from raw user input |
| Pagination | Returning every record |
| Consistent API errors | Different error shapes everywhere |
| Least-privilege IAM | Administrator permissions for applications |
| Small reusable React components | One huge component for the whole application |
| Meaningful Git commits | Generic 'changes' commits |
| HTTPS | HTTP for production credentials/data |
| Indexes based on query patterns | Adding indexes to every field |
| Automated tests | Testing only manually through the UI |
| Useful logs without secrets | Logging passwords/tokens |

**Final Principle**

A good full-stack application is not only one that works.  
It should be secure, maintainable, testable, understandable, responsive and efficient.