# Data model

Incidents have immutable UUIDs and public IDs, permanent slug URLs, form-schema snapshots, map configuration, optional reporting-area geography, and lifecycle state. Templates are reusable source schemas.

Reports separate private submitted coordinates from public display coordinates. Approximate reports store one server-generated public point and a 152.4 metre privacy radius. Reports also retain only hashed browser, IP, and edit-token identifiers, plus audit events and moderation status.
