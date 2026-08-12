# Privacy and security

Exact reports expose their chosen coordinate. Approximate reports retain the true coordinate privately and show a stable server-generated point no more than 152.4 metres away, with a privacy circle containing the true location.

IP addresses are HMAC-hashed with a dedicated secret. Browser tokens and edit tokens are strongly hashed. These values are abuse controls, not identity proof. Submitted street addresses are not stored as public report data. Administrators must use an audited, explicitly protected path to access private coordinates.
