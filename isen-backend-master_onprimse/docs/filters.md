User discovery filters

This doc describes the supported query parameters for the `GET /api/v1/user/users` endpoint used by the "Find New Friends" flow.

Query params (GET /api/v1/user/users)
- page (number) - 0-based page index. Default 0.
- type (string) - 'near' (city/country based) or 'random'.
- gender (string) - 'male' | 'female' | 'both'
- profession (string) - '1' to match authenticated user's profession; otherwise pass a string.
- education (string) - '1' to match authenticated user's education; otherwise pass a string.
- school (string) - '1' to match auth user's school.
- interests (string) - comma-separated interests or '1' to match auth user's interests.
- languages (string) - comma-separated language codes/names.
- minAge (number) - minimum age (years)
- maxAge (number) - maximum age (years)
- q (string) - free-text search against firstName, lastName, aboutMe (case-insensitive)
- online (1|true) - filter to only online users (server filters after fetching candidates to respect online status)
- sort - lastActive | followers | distance

Examples:
- Nearby, age 18-25, interests music or sports:
  GET /api/v1/user/users?page=0&type=near&minAge=18&maxAge=25&interests=music,sports

- Online users who speak English:
  GET /api/v1/user/users?online=1&languages=English

Notes:
- Age filters are converted server-side to birthDate ranges; API will not return birthDate unless requested.
- Online filtering may fetch a capped batch of candidates and then filter by live presence to avoid full collection scans.