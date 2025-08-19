;; AeroGuard Parts Registry Contract
;; Clarity v2
;; Implements registration and certification of aerospace parts as NFTs with immutable metadata.
;; Supports minting, transferring, burning, approvals, and verification of part authenticity.
;; Ensures uniqueness of serial numbers and provides robust admin controls.

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-ALREADY-EXISTS u101)
(define-constant ERR-DOES-NOT-EXIST u102)
(define-constant ERR-NOT-OWNER u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-METADATA u106)
(define-constant ERR-NOT-APPROVED u107)
(define-constant ERR-MAX-TOKENS-REACHED u108)
(define-constant ERR-INVALID-TOKEN-ID u109)

;; NFT metadata constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MAX-TOKEN-SUPPLY u1000000) ;; Arbitrary max for scalability

;; Admin and contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var last-token-id uint u0)
(define-data-var certifier principal tx-sender) ;; Separate certifier role for certification

;; Maps for NFT state
(define-map token-owners uint principal) ;; token-id -> owner
(define-map token-approvals uint principal) ;; token-id -> approved operator (optional-none if none)
(define-map token-metadata uint
  {
    serial-number: (string-ascii 64),
    manufacturer: (string-ascii 128),
    material: (string-ascii 128),
    certification: (string-ascii 256), ;; e.g., FAA certification details
    manufacture-date: uint, ;; block height or timestamp
    additional-data: (optional (buff 1024)) ;; Flexible binary data
  }
)
(define-map serial-to-token (string-ascii 64) uint) ;; Ensure serial uniqueness

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: is-certifier
(define-private (is-certifier)
  (is-eq tx-sender (var-get certifier))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: validate metadata
(define-private (validate-metadata (metadata {serial-number: (string-ascii 64), manufacturer: (string-ascii 128), material: (string-ascii 128), certification: (string-ascii 256), manufacture-date: uint, additional-data: (optional (buff 1024))}))
  (and
    (> (len (get serial-number metadata)) u0)
    (> (len (get manufacturer metadata)) u0)
    (> (len (get material metadata)) u0)
    (> (len (get certification metadata)) u0)
    (> (get manufacture-date metadata) u0)
  )
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Transfer certifier rights
(define-public (transfer-certifier (new-certifier principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-certifier 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set certifier new-certifier)
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Mint a new part NFT (certifier only)
(define-public (mint (recipient principal) (metadata {serial-number: (string-ascii 64), manufacturer: (string-ascii 128), material: (string-ascii 128), certification: (string-ascii 256), manufacture-date: uint, additional-data: (optional (buff 1024))}))
  (let
    (
      (new-token-id (+ (var-get last-token-id) u1))
      (serial (get serial-number metadata))
    )
    (asserts! (is-certifier) (err ERR-NOT-AUTHORIZED))
    (ensure-not-paused)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (validate-metadata metadata) (err ERR-INVALID-METADATA))
    (asserts! (is-none (map-get? serial-to-token serial)) (err ERR-ALREADY-EXISTS))
    (asserts! (<= new-token-id MAX-TOKEN-SUPPLY) (err ERR-MAX-TOKENS-REACHED))
    (map-set token-owners new-token-id recipient)
    (map-set token-metadata new-token-id metadata)
    (map-set serial-to-token serial new-token-id)
    (var-set last-token-id new-token-id)
    (print { event: "mint", token-id: new-token-id, recipient: recipient, metadata: metadata }) ;; For logging
    (ok new-token-id)
  )
)

;; Burn a part NFT (owner only, e.g., for scrapped parts)
(define-public (burn (token-id uint))
  (let
    (
      (owner (unwrap! (map-get? token-owners token-id) (err ERR-DOES-NOT-EXIST)))
      (serial (get serial-number (unwrap! (map-get? token-metadata token-id) (err ERR-DOES-NOT-EXIST))))
    )
    (asserts! (is-eq tx-sender owner) (err ERR-NOT-OWNER))
    (ensure-not-paused)
    (map-delete token-owners token-id)
    (map-delete token-metadata token-id)
    (map-delete serial-to-token serial)
    (map-delete token-approvals token-id)
    (print { event: "burn", token-id: token-id, owner: owner })
    (ok true)
  )
)

;; Transfer NFT (owner or approved)
(define-public (transfer (token-id uint) (recipient principal))
  (let
    (
      (owner (unwrap! (map-get? token-owners token-id) (err ERR-DOES-NOT-EXIST)))
      (approved (default-to 'SP000000000000000000002Q6VF78 (map-get? token-approvals token-id)))
    )
    (ensure-not-paused)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (or (is-eq tx-sender owner) (is-eq tx-sender approved)) (err ERR-NOT-APPROVED))
    (map-set token-owners token-id recipient)
    (map-delete token-approvals token-id) ;; Clear approval after transfer
    (print { event: "transfer", token-id: token-id, from: owner, to: recipient })
    (ok true)
  )
)

;; Approve an operator for a token
(define-public (approve (token-id uint) (operator principal))
  (let
    (
      (owner (unwrap! (map-get? token-owners token-id) (err ERR-DOES-NOT-EXIST)))
    )
    (asserts! (is-eq tx-sender owner) (err ERR-NOT-OWNER))
    (asserts! (not (is-eq operator 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (map-set token-approvals token-id operator)
    (ok true)
  )
)

;; Revoke approval for a token
(define-public (revoke-approval (token-id uint))
  (let
    (
      (owner (unwrap! (map-get? token-owners token-id) (err ERR-DOES-NOT-EXIST)))
    )
    (asserts! (is-eq tx-sender owner) (err ERR-NOT-OWNER))
    (map-delete token-approvals token-id)
    (ok true)
  )
)

;; Read-only: Get owner of token
(define-read-only (get-owner (token-id uint))
  (ok (map-get? token-owners token-id))
)

;; Read-only: Get metadata of token
(define-read-only (get-metadata (token-id uint))
  (ok (map-get? token-metadata token-id))
)

;; Read-only: Get token ID by serial number
(define-read-only (get-token-by-serial (serial (string-ascii 64)))
  (ok (map-get? serial-to-token serial))
)

;; Read-only: Verify if part exists and is certified (simple check for existence)
(define-read-only (verify-part (token-id uint))
  (match (map-get? token-metadata token-id)
    metadata (ok true)
    (ok false)
  )
)

;; Read-only: Get last token ID
(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Get certifier
(define-read-only (get-certifier)
  (ok (var-get certifier))
)

;; Read-only: Check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Additional utility: Batch mint (up to 5 for gas efficiency)
(define-public (batch-mint (recipients (list 5 principal)) (metadatas (list 5 {serial-number: (string-ascii 64), manufacturer: (string-ascii 128), material: (string-ascii 128), certification: (string-ascii 256), manufacture-date: uint, additional-data: (optional (buff 1024))})))
  (let
    (
      (ids (map mint-batch-helper recipients metadatas))
    )
    (ok ids)
  )
)

(define-private (mint-batch-helper (recipient principal) (metadata {serial-number: (string-ascii 64), manufacturer: (string-ascii 128), material: (string-ascii 128), certification: (string-ascii 256), manufacture-date: uint, additional-data: (optional (buff 1024))}))
  (unwrap! (mint recipient metadata) u0) ;; If fails, will abort
)