<?php
/**
 * ExamPulse AI - Live Production Backend API (Hostinger Compatible)
 * Implements PDO MySQL synchronization, user authentication, and Google Gemini API integration.
 */

// Enable error reporting for diagnostics during configuration
error_reporting(E_ALL);
ini_set('display_errors', 0); // Keep output clean for JSON parsing, log errors instead

// Secure CORS Headers to allow direct cross-origin fetches from local files or distinct subdomains
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Preflight CORS request termination
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// ==========================================
// 1. LIVE BACKEND CONFIGURATION
// ==========================================
define('DB_HOST', 'localhost');
define('DB_USER', 'root'); // Edit to your Hostinger MySQL Database Username
define('DB_PASS', '');     // Edit to your Hostinger MySQL Database Password
define('DB_NAME', 'exampulse_db'); // Edit to your Hostinger MySQL Database Name

// Google Gemini API Key - Replace with your live Google AI Studio API key!
define('GEMINI_API_KEY', 'YOUR_GEMINI_API_KEY_HERE'); 

// Connect to Database using PDO (PHP Data Objects)
function getDbConnection() {
    try {
        $dsn = "mysql:host=" . DB_HOST . ";charset=utf8mb4";
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        
        // Auto-create database if not exists
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `" . DB_NAME . "`");
        
        return $pdo;
    } catch (PDOException $e) {
        sendResponse(500, ["error" => "Database Connection Failed: " . $e->getMessage()]);
    }
}

// Auto Setup/Install MySQL Tables
function autoSetupTables($db) {
    try {
        // Users Table
        $db->exec("CREATE TABLE IF NOT EXISTS `users` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(100) NOT NULL,
            `username` VARCHAR(50) NOT NULL UNIQUE,
            `email` VARCHAR(100) NOT NULL UNIQUE,
            `password_hash` VARCHAR(255) NOT NULL,
            `suspended` TINYINT(1) DEFAULT 0,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;");

        // Answer History Table
        $db->exec("CREATE TABLE IF NOT EXISTS `history` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `question_id` INT NOT NULL,
            `result` TINYINT(1) NOT NULL,
            `response_time` DECIMAL(5,2) NOT NULL,
            `selected_idx` INT NOT NULL,
            `timestamp` BIGINT NOT NULL,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB;");

        // Saved Bookmarks Table
        $db->exec("CREATE TABLE IF NOT EXISTS `bookmarks` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `question_id` INT NOT NULL,
            UNIQUE KEY `unique_bookmark` (`user_id`, `question_id`),
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB;");

        // Spaced Repetition/Revisions Table
        $db->exec("CREATE TABLE IF NOT EXISTS `revisions` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `question_id` INT NOT NULL,
            `next_review_timestamp` BIGINT NOT NULL,
            `interval_level` INT NOT NULL,
            UNIQUE KEY `unique_revision` (`user_id`, `question_id`),
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB;");

        // Active Locks Table to prevent simultaneous serving of same question
        $db->exec("CREATE TABLE IF NOT EXISTS `active_locks` (
            `question_id` INT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `locked_at` BIGINT NOT NULL
        ) ENGINE=InnoDB;");
        
    } catch (PDOException $e) {
        sendResponse(500, ["error" => "Table Installation Failed: " . $e->getMessage()]);
    }
}

// Helper: Standardized JSON Responses
function sendResponse($statusCode, $data) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// ==========================================
// 2. BACKEND API ROUTER
// ==========================================
$db = getDbConnection();
autoSetupTables($db);

$action = isset($_GET['action']) ? trim($_GET['action']) : '';

// Parse JSON request payloads
$inputData = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $inputData = $decoded;
    }
}

switch ($action) {
    // ------------------------------------------
    // candidate registration API
    // ------------------------------------------
    case 'register':
        $name = isset($inputData['name']) ? trim($inputData['name']) : '';
        $username = isset($inputData['username']) ? trim($inputData['username']) : '';
        $email = isset($inputData['email']) ? trim($inputData['email']) : '';
        $password = isset($inputData['password']) ? trim($inputData['password']) : '';

        if (empty($name) || empty($username) || empty($email) || empty($password)) {
            sendResponse(400, ["error" => "All fields (name, username, email, password) are strictly required."]);
        }

        // Check if username already exists
        $stmt = $db->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$username]);
        if ($stmt->fetch()) {
            sendResponse(400, ["error" => "Username is already claimed by another aspirant."]);
        }

        // Check if email already exists
        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            sendResponse(400, ["error" => "Email address is already registered."]);
        }

        // Create secure password hash
        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);

        try {
            $stmt = $db->prepare("INSERT INTO users (name, username, email, password_hash) VALUES (?, ?, ?, ?)");
            $stmt->execute([$name, $username, $email, $passwordHash]);
            $userId = $db->lastInsertId();

            sendResponse(201, [
                "success" => true,
                "user" => [
                    "id" => $userId,
                    "name" => $name,
                    "username" => $username,
                    "email" => $email,
                    "suspended" => false
                ]
            ]);
        } catch (PDOException $e) {
            sendResponse(500, ["error" => "Failed to create account: " . $e->getMessage()]);
        }
        break;

    // ------------------------------------------
    // candidate sign-in API
    // ------------------------------------------
    case 'login':
        $email = isset($inputData['email']) ? trim($inputData['email']) : '';
        $password = isset($inputData['password']) ? trim($inputData['password']) : '';

        if (empty($email) || empty($password)) {
            sendResponse(400, ["error" => "Email and password are required."]);
        }

        $stmt = $db->prepare("SELECT id, name, username, email, password_hash, suspended FROM users WHERE email = ? OR username = ?");
        $stmt->execute([$email, $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            sendResponse(401, ["error" => "Invalid email/username or password credentials."]);
        }

        if ($user['suspended']) {
            sendResponse(403, ["error" => "This account has been suspended by the platform administrator."]);
        }

        sendResponse(200, [
            "success" => true,
            "user" => [
                "id" => $user['id'],
                "name" => $user['name'],
                "username" => $user['username'],
                "email" => $user['email'],
                "suspended" => false
            ]
        ]);
        break;

    // ------------------------------------------
    // database synchronization API
    // ------------------------------------------
    case 'sync':
        $userId = isset($inputData['userId']) ? intval($inputData['userId']) : 0;
        
        if ($userId <= 0) {
            sendResponse(400, ["error" => "Valid User ID required for state synchronization."]);
        }

        // Verify user suspension status in real-time
        $stmt = $db->prepare("SELECT suspended FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $userCheck = $stmt->fetch();
        if (!$userCheck) {
            sendResponse(404, ["error" => "User account not found."]);
        }
        if ($userCheck['suspended']) {
            sendResponse(403, ["error" => "Account Suspended", "suspended" => true]);
        }

        // Push local history, bookmarks, and revisions if provided
        $localHistory = isset($inputData['history']) ? $inputData['history'] : [];
        $localBookmarks = isset($inputData['bookmarks']) ? $inputData['bookmarks'] : [];
        $localRevisions = isset($inputData['revisions']) ? $inputData['revisions'] : [];

        // Begin SQL Transaction for data integrity
        $db->beginTransaction();
        try {
            // 1. Sync History in-place
            foreach ($localHistory as $qid => $val) {
                $stmt = $db->prepare("SELECT id FROM history WHERE user_id = ? AND question_id = ?");
                $stmt->execute([$userId, $qid]);
                if (!$stmt->fetch()) {
                    $ins = $db->prepare("INSERT INTO history (user_id, question_id, result, response_time, selected_idx, `timestamp`) VALUES (?, ?, ?, ?, ?, ?)");
                    $ins->execute([
                        $userId, 
                        $qid, 
                        $val['result'] ? 1 : 0, 
                        $val['responseTime'], 
                        $val['selectedIdx'], 
                        $val['timestamp']
                    ]);
                }
            }

            // 2. Sync Bookmarks
            // Clear current server bookmarks and override with client arrays to prevent sync clashes
            $stmt = $db->prepare("DELETE FROM bookmarks WHERE user_id = ?");
            $stmt->execute([$userId]);
            foreach ($localBookmarks as $qid) {
                $ins = $db->prepare("INSERT INTO bookmarks (user_id, question_id) VALUES (?, ?)");
                $ins->execute([$userId, $qid]);
            }

            // 3. Sync Revisions
            $stmt = $db->prepare("DELETE FROM revisions WHERE user_id = ?");
            $stmt->execute([$userId]);
            foreach ($localRevisions as $rev) {
                $ins = $db->prepare("INSERT INTO revisions (user_id, question_id, next_review_timestamp, interval_level) VALUES (?, ?, ?, ?)");
                $ins->execute([
                    $userId, 
                    $rev['qid'], 
                    $rev['nextReviewTimestamp'], 
                    $rev['intervalLevel']
                ]);
            }

            $db->commit();
        } catch (PDOException $e) {
            $db->rollBack();
            sendResponse(500, ["error" => "Database sync failed: " . $e->getMessage()]);
        }

        // Pull consolidated server state to return to client
        $serverHistory = [];
        $stmt = $db->prepare("SELECT question_id, result, response_time, selected_idx, `timestamp` FROM history WHERE user_id = ?");
        $stmt->execute([$userId]);
        while ($row = $stmt->fetch()) {
            $serverHistory[$row['question_id']] = [
                "result" => $row['result'] == 1,
                "responseTime" => floatval($row['response_time']),
                "selectedIdx" => intval($row['selected_idx']),
                "timestamp" => intval($row['timestamp'])
            ];
        }

        $serverBookmarks = [];
        $stmt = $db->prepare("SELECT question_id FROM bookmarks WHERE user_id = ?");
        $stmt->execute([$userId]);
        while ($row = $stmt->fetch()) {
            $serverBookmarks[] = intval($row['question_id']);
        }

        $serverRevisions = [];
        $stmt = $db->prepare("SELECT question_id, next_review_timestamp, interval_level FROM revisions WHERE user_id = ?");
        $stmt->execute([$userId]);
        while ($row = $stmt->fetch()) {
            $serverRevisions[] = [
                "qid" => intval($row['question_id']),
                "nextReviewTimestamp" => intval($row['next_review_timestamp']),
                "intervalLevel" => intval($row['interval_level'])
            ];
        }

        sendResponse(200, [
            "success" => true,
            "state" => [
                "history" => $serverHistory,
                "bookmarks" => $serverBookmarks,
                "revisions" => $serverRevisions
            ]
        ]);
        break;

    // ------------------------------------------
    // dynamic gemini exam questions engine API
    // ------------------------------------------
    case 'get_question':
        $category = isset($_GET['category']) ? trim($_GET['category']) : 'Reasoning';
        $difficulty = isset($_GET['difficulty']) ? trim($_GET['difficulty']) : 'Medium';
        $userId = isset($_GET['userId']) ? intval($_GET['userId']) : 0;
        if ($userId <= 0) {
            $userId = mt_rand(1000000, 9999999);
        }

        // Clean up expired locks from db
        $now = time();
        $expiredTime = $now - 30; // 30 seconds expiration
        $cleanStmt = $db->prepare("DELETE FROM active_locks WHERE locked_at < ?");
        $cleanStmt->execute([$expiredTime]);

        // Get currently locked questions and answered questions for this user
        $answeredIds = [];
        $stmt = $db->prepare("SELECT question_id FROM history WHERE user_id = ?");
        $stmt->execute([$userId]);
        while ($row = $stmt->fetch()) {
            $answeredIds[] = intval($row['question_id']);
        }

        $lockedIds = [];
        $lockStmt = $db->prepare("SELECT question_id FROM active_locks WHERE user_id != ?");
        $lockStmt->execute([$userId]);
        while ($row = $lockStmt->fetch()) {
            $lockedIds[] = intval($row['question_id']);
        }

        $excludeIds = array_unique(array_merge($answeredIds, $lockedIds));

        // If Gemini API is configured, request live AI question generation!
        if (GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' && !empty(GEMINI_API_KEY)) {
            $liveQuestion = fetchQuestionFromGemini($category, $difficulty);
            if ($liveQuestion) {
                // Ensure unique non-repetitive QID
                $iterations = 0;
                while (in_array($liveQuestion['id'], $excludeIds) && $iterations < 100) {
                    $liveQuestion['id'] = 2000 + rand(1, 99999);
                    $iterations++;
                }
                
                // Acquire concurrent serve lock
                $insLock = $db->prepare("REPLACE INTO active_locks (question_id, user_id, locked_at) VALUES (?, ?, ?)");
                $insLock->execute([$liveQuestion['id'], $userId, $now]);

                sendResponse(200, ["success" => true, "question" => $liveQuestion]);
            }
        }
        
        // Fail-safe Graceful fallback: return null to let engines.js fallback to local seeding
        sendResponse(200, [
            "success" => false, 
            "message" => "Gemini API key not configured or offline. Falling back to local offline Seed PYQ pool."
        ]);
        break;

    case 'lock_question':
        $qid = isset($_GET['qid']) ? intval($_GET['qid']) : 0;
        $userId = isset($_GET['userId']) ? intval($_GET['userId']) : 0;
        if ($userId <= 0) {
            $userId = mt_rand(1000000, 9999999);
        }

        if ($qid <= 0) {
            sendResponse(400, ["error" => "Valid Question ID required."]);
        }

        $now = time();
        $expiredTime = $now - 30; // 30 seconds expiration

        // Clean up expired locks
        $cleanStmt = $db->prepare("DELETE FROM active_locks WHERE locked_at < ?");
        $cleanStmt->execute([$expiredTime]);

        // Check if question is locked by someone else
        $stmt = $db->prepare("SELECT user_id FROM active_locks WHERE question_id = ? AND user_id != ?");
        $stmt->execute([$qid, $userId]);
        if ($stmt->fetch()) {
            sendResponse(200, ["success" => false, "message" => "Question is currently locked by another active user."]);
        }

        // Lock it
        $ins = $db->prepare("REPLACE INTO active_locks (question_id, user_id, locked_at) VALUES (?, ?, ?)");
        $ins->execute([$qid, $userId, $now]);

        sendResponse(200, ["success" => true, "message" => "Question locked successfully."]);
        break;

    default:
        sendResponse(404, ["error" => "ExamPulse AI API Action endpoint not found."]);
        break;
}

// ==========================================
// 3. GOOGLE GEMINI API CONNECTOR
// ==========================================
function fetchQuestionFromGemini($category, $difficulty) {
    $apiKey = GEMINI_API_KEY;
    
    // Construct strict, highly structured system-style prompt to force clean schema output
    $promptText = "Generate exactly ONE highly realistic, verified previous year question (PYQ) pattern from Indian competitive government exams (like UPSC CSAT, SSC CGL, RRB NTPC, or SBI PO) matching these constraints:
- Category: " . $category . "
- Difficulty level: " . $difficulty . "
- No trivia or entertainment. Academic, logical, and technical government exam preparation ONLY.
- Return absolutely clean JSON and NOTHING else. No markdown wrappers, no backticks, no text explanation outside the JSON itself. It must be directly parseable as a valid JSON object.

JSON Schema format to follow exactly:
{
  \"id\": " . (2000 + rand(1, 9999)) . ",
  \"category\": \"" . $category . "\",
  \"tag\": \"Subtopic name (e.g. Percentage, Coding-Decoding)\",
  \"question\": \"Complete concise question text. (Use small letters and compact text where possible)\",
  \"options\": [\"Option A text\", \"Option B text\", \"Option C text\", \"Option D text\"],
  \"correctOptionIndex\": 0-3 numerical index of correct option,
  \"explanation\": \"Deeply detailed verified RAG explanation of correct answer logic.\",
  \"concept\": \"Core syllabus concept focus.\",
  \"shortcut\": \"Shortcut formula or fast exam solving method if applicable, otherwise brief hint.\",
  \"source\": \"Specific Government exam name and year (e.g. UPSC CSAT 2022, SSC CGL 2023)\",
  \"difficulty\": \"" . $difficulty . "\",
  \"takeaway\": \"Key visual takeaway to lock in long-term retention.\"
}";

    $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" . $apiKey;
    
    $payload = [
        "contents" => [
            [
                "parts" => [
                    ["text" => $promptText]
                ]
            ]
        ],
        "generationConfig" => [
            "responseMimeType" => "application/json"
        ]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Recommended for easy local hosting SSL verification compatibility

    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        return null;
    }

    try {
        $resDecoded = json_decode($response, true);
        if (isset($resDecoded['candidates'][0]['content']['parts'][0]['text'])) {
            $jsonString = trim($resDecoded['candidates'][0]['content']['parts'][0]['text']);
            $questionObj = json_decode($jsonString, true);
            if (is_array($questionObj) && isset($questionObj['question']) && isset($questionObj['options']) && isset($questionObj['correctOptionIndex'])) {
                return $questionObj;
            }
        }
    } catch (Exception $e) {
        return null;
    }
    
    return null;
}
