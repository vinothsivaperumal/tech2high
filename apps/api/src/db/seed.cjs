const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgres://postgres:postgres@localhost:5432/tech2high_portal'
});

async function hash(pw) {
  return bcrypt.hash(pw, 12);
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Hash the shared password: "Test@1234"
    const pw = await hash('Test@1234');

    // ── Admin ────────────────────────────────────────
    const admin = (await client.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone, city, state, country, institute, experience_level)
       VALUES ($1, $2, 'admin', $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      ['admin@tech2high.com', pw, 'Agathesh Velan', '(123) 456-7890', 'Chennai', 'Tamil Nadu', 'India', 'Tech2High', 'Expert']
    )).rows[0];
    console.log('Admin:', admin.id);

    // ── Trainers ─────────────────────────────────────
    const trainers = [];
    const trainerData = [
      ['trainer1@tech2high.com', 'Rajesh Kumar', '(234) 567-8901', 'Bangalore', 'Karnataka', 'India', 'Tech2High Academy', 'Advanced'],
      ['trainer2@tech2high.com', 'Priya Sharma', '(345) 678-9012', 'Hyderabad', 'Telangana', 'India', 'Tech2High Academy', 'Expert'],
      ['trainer3@tech2high.com', 'David Chen', '(456) 789-0123', 'San Francisco', 'California', 'United States', 'Tech2High US', 'Advanced'],
    ];
    for (const [email, name, phone, city, state, country, inst, lvl] of trainerData) {
      const r = (await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, phone, city, state, country, institute, experience_level)
         VALUES ($1, $2, 'trainer', $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [email, pw, name, phone, city, state, country, inst, lvl]
      )).rows[0];
      trainers.push(r.id);
      console.log('Trainer:', name, r.id);
    }

    // ── Students ─────────────────────────────────────
    const students = [];
    const studentData = [
      ['student1@tech2high.com', 'Arun Patel', '(111) 222-3333', 'Mumbai', 'Maharashtra', 'India', 'IIT Bombay', 'Beginner'],
      ['student2@tech2high.com', 'Sneha Reddy', '(222) 333-4444', 'Chennai', 'Tamil Nadu', 'India', 'Anna University', 'Intermediate'],
      ['student3@tech2high.com', 'Mohammed Ali', '(333) 444-5555', 'Delhi', 'Delhi', 'India', 'IIIT Delhi', 'Beginner'],
      ['student4@tech2high.com', 'Emily Johnson', '(444) 555-6666', 'New York', 'New York', 'United States', 'NYU', 'Advanced'],
      ['student5@tech2high.com', 'Sarah Williams', '(555) 666-7777', 'London', 'England', 'United Kingdom', 'Imperial College', 'Intermediate'],
      ['student6@tech2high.com', 'Karthik Subramanian', '(666) 777-8888', 'Coimbatore', 'Tamil Nadu', 'India', 'PSG Tech', 'Beginner'],
      ['student7@tech2high.com', 'Lisa Zhang', '(777) 888-9999', 'Toronto', 'Ontario', 'Canada', 'University of Toronto', 'Advanced'],
      ['student8@tech2high.com', 'Vikram Singh', '(888) 999-0000', 'Pune', 'Maharashtra', 'India', 'COEP', 'Intermediate'],
      ['student9@tech2high.com', 'Ananya Gupta', '(999) 000-1111', 'Kolkata', 'West Bengal', 'India', 'Jadavpur University', 'Expert'],
      ['student10@tech2high.com', 'James Brown', '(101) 202-3030', 'Austin', 'Texas', 'United States', 'UT Austin', 'Beginner'],
      ['student11@tech2high.com', 'Deepika Nair', '(102) 203-3040', 'Kochi', 'Kerala', 'India', 'NIT Calicut', 'Intermediate'],
      ['student12@tech2high.com', 'Rahul Verma', '(103) 204-3050', 'Jaipur', 'Rajasthan', 'India', 'MNIT Jaipur', 'Beginner'],
    ];
    for (const [email, name, phone, city, state, country, inst, lvl] of studentData) {
      const r = (await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, phone, city, state, country, institute, experience_level)
         VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [email, pw, name, phone, city, state, country, inst, lvl]
      )).rows[0];
      students.push(r.id);
      console.log('Student:', name, r.id);
    }

    // ── Batches ──────────────────────────────────────
    const batchData = [
      ['SQL Fundamentals - Batch 2026-A', trainers[0]],
      ['Python Data Science - Batch 2026-B', trainers[1]],
      ['Cloud & AWS - Batch 2026-C', trainers[2]],
      ['React Full Stack - Batch 2026-D', trainers[0]],
    ];
    const batchIds = [];
    for (const [name, trainerId] of batchData) {
      const r = (await client.query(
        `INSERT INTO batches (name, trainer_id) VALUES ($1, $2) RETURNING id`,
        [name, trainerId]
      )).rows[0];
      batchIds.push(r.id);
      console.log('Batch:', name, r.id);
    }

    // ── Assign students to batches ───────────────────
    // Batch A: students 0-3, Batch B: students 2-6, Batch C: students 4-8, Batch D: students 7-11
    const assignments = [
      [batchIds[0], [students[0], students[1], students[2], students[3]]],
      [batchIds[1], [students[2], students[3], students[4], students[5], students[6]]],
      [batchIds[2], [students[4], students[5], students[6], students[7], students[8]]],
      [batchIds[3], [students[7], students[8], students[9], students[10], students[11]]],
    ];
    for (const [batchId, studentIds] of assignments) {
      for (const sid of studentIds) {
        await client.query(
          `INSERT INTO batch_students (batch_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [batchId, sid]
        );
      }
    }
    console.log('Assigned students to batches');

    // ── Batch Videos (YouTube) ───────────────────────
    const videoData = [
      [batchIds[0], 'SQL SELECT Basics', 'Learn the fundamentals of SELECT queries', 'https://www.youtube.com/watch?v=7S_tz1z_5bA', admin.id],
      [batchIds[0], 'SQL JOINs Explained', 'Understanding INNER, LEFT, RIGHT and FULL joins', 'https://www.youtube.com/watch?v=9yeOJ0ZMUYw', admin.id],
      [batchIds[0], 'SQL Subqueries & CTEs', 'Advanced querying techniques', 'https://www.youtube.com/watch?v=m1KcNV-Zhmc', admin.id],
      [batchIds[1], 'Python for Beginners', 'Getting started with Python programming', 'https://www.youtube.com/watch?v=kqtD5dpn9C8', admin.id],
      [batchIds[1], 'Pandas DataFrame Tutorial', 'Data manipulation with Pandas', 'https://www.youtube.com/watch?v=vmEHCJofslg', admin.id],
      [batchIds[1], 'Data Visualization with Matplotlib', 'Creating charts and graphs', 'https://www.youtube.com/watch?v=UO98lJQ3QGI', admin.id],
      [batchIds[2], 'AWS EC2 Basics', 'Launching and managing EC2 instances', 'https://www.youtube.com/watch?v=iHX-jtKIVNA', admin.id],
      [batchIds[2], 'AWS S3 Deep Dive', 'Understanding S3 storage classes and security', 'https://www.youtube.com/watch?v=tfU0JEZjFIQ', admin.id],
      [batchIds[3], 'React Hooks Crash Course', 'Understanding useState, useEffect and more', 'https://www.youtube.com/watch?v=TNhaISOUy6Q', admin.id],
      [batchIds[3], 'Building REST APIs with Express', 'Backend development with Node.js', 'https://www.youtube.com/watch?v=pKd0Rpw7O48', admin.id],
    ];
    for (const [bid, title, desc, url, uploadedBy] of videoData) {
      await client.query(
        `INSERT INTO videos (batch_id, title, description, youtube_url, s3_key, uploaded_by)
         VALUES ($1, $2, $3, $4, '', $5)`,
        [bid, title, desc, url, uploadedBy]
      );
    }
    console.log('Added batch videos');

    // ── Courses ──────────────────────────────────────
    const courseData = [
      ['SQL Mastery', 'Complete SQL course from basics to advanced query optimization'],
      ['Python for Data Science', 'Learn Python programming with focus on data analysis and machine learning'],
      ['AWS Cloud Architecture', 'Design and deploy scalable cloud solutions on AWS'],
    ];
    const courseIds = [];
    for (const [title, desc] of courseData) {
      const r = (await client.query(
        `INSERT INTO courses (title, description, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [title, desc, admin.id]
      )).rows[0];
      courseIds.push(r.id);
      console.log('Course:', title, r.id);
    }

    // ── Course Topics & Videos ───────────────────────
    const topicsAndVideos = [
      // SQL Mastery
      [courseIds[0], [
        ['Introduction to SQL', 0, [
          ['What is SQL?', 'https://www.youtube.com/watch?v=27axs9dO7AE', 0],
          ['Setting Up Your Database', 'https://www.youtube.com/watch?v=7S_tz1z_5bA', 1],
        ]],
        ['SELECT & Filtering', 1, [
          ['SELECT Statement Deep Dive', 'https://www.youtube.com/watch?v=9yeOJ0ZMUYw', 0],
          ['WHERE Clause & Operators', 'https://www.youtube.com/watch?v=m1KcNV-Zhmc', 1],
        ]],
        ['JOINs & Relationships', 2, [
          ['Understanding JOINs', 'https://www.youtube.com/watch?v=9yeOJ0ZMUYw', 0],
          ['Practical JOIN Examples', 'https://www.youtube.com/watch?v=Jh_pvk48jHA', 1],
        ]],
      ]],
      // Python
      [courseIds[1], [
        ['Python Basics', 0, [
          ['Variables & Data Types', 'https://www.youtube.com/watch?v=kqtD5dpn9C8', 0],
          ['Control Flow', 'https://www.youtube.com/watch?v=DZwmZ8Usvnk', 1],
        ]],
        ['Data Analysis with Pandas', 1, [
          ['Introduction to Pandas', 'https://www.youtube.com/watch?v=vmEHCJofslg', 0],
          ['Data Cleaning Techniques', 'https://www.youtube.com/watch?v=UO98lJQ3QGI', 1],
        ]],
      ]],
      // AWS
      [courseIds[2], [
        ['Cloud Fundamentals', 0, [
          ['What is Cloud Computing?', 'https://www.youtube.com/watch?v=iHX-jtKIVNA', 0],
          ['AWS Global Infrastructure', 'https://www.youtube.com/watch?v=tfU0JEZjFIQ', 1],
        ]],
        ['Compute & Storage', 1, [
          ['EC2 Instance Types', 'https://www.youtube.com/watch?v=iHX-jtKIVNA', 0],
          ['S3 Bucket Policies', 'https://www.youtube.com/watch?v=tfU0JEZjFIQ', 1],
        ]],
      ]],
    ];

    for (const [courseId, topics] of topicsAndVideos) {
      for (const [topicTitle, sortOrder, videos] of topics) {
        const t = (await client.query(
          `INSERT INTO course_topics (course_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id`,
          [courseId, topicTitle, sortOrder]
        )).rows[0];
        for (const [vTitle, vUrl, vSort] of videos) {
          await client.query(
            `INSERT INTO course_videos (topic_id, title, youtube_url, sort_order) VALUES ($1, $2, $3, $4)`,
            [t.id, vTitle, vUrl, vSort]
          );
        }
      }
    }
    console.log('Added courses with topics and videos');

    // ── Programs ─────────────────────────────────────
    const programData = [
      ['Cloud Data Analysis', 'Comprehensive data analysis program covering SQL, Python, and AWS cloud services'],
      ['Full Stack Development', 'End-to-end web development with React and Node.js'],
    ];
    const programIds = [];
    for (const [title, desc] of programData) {
      const r = (await client.query(
        `INSERT INTO programs (title, description, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [title, desc, admin.id]
      )).rows[0];
      programIds.push(r.id);
      console.log('Program:', title, r.id);
    }

    // ── Program Courses ──────────────────────────────
    // Cloud Data Analysis: SQL Mastery + Python for Data Science + AWS Cloud Architecture
    for (let i = 0; i < courseIds.length; i++) {
      await client.query(
        `INSERT INTO program_courses (program_id, course_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [programIds[0], courseIds[i], i]
      );
    }
    console.log('Assigned courses to Cloud Data Analysis program');

    // ── Link Batches to Programs ─────────────────────
    // Batch A (SQL) and Batch B (Python) → Cloud Data Analysis
    await client.query(`UPDATE batches SET program_id = $1 WHERE id = $2`, [programIds[0], batchIds[0]]);
    await client.query(`UPDATE batches SET program_id = $1 WHERE id = $2`, [programIds[0], batchIds[1]]);
    await client.query(`UPDATE batches SET program_id = $1 WHERE id = $2`, [programIds[0], batchIds[2]]);
    console.log('Linked batches to programs');

    // ── Batch Courses (batch-level access control) ───
    // Batch A: SQL Mastery only
    await client.query(`INSERT INTO batch_courses (batch_id, course_id, sort_order) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`, [batchIds[0], courseIds[0]]);
    // Batch B: Python + SQL
    await client.query(`INSERT INTO batch_courses (batch_id, course_id, sort_order) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`, [batchIds[1], courseIds[1]]);
    await client.query(`INSERT INTO batch_courses (batch_id, course_id, sort_order) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`, [batchIds[1], courseIds[0]]);
    // Batch C: AWS + Python
    await client.query(`INSERT INTO batch_courses (batch_id, course_id, sort_order) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`, [batchIds[2], courseIds[2]]);
    await client.query(`INSERT INTO batch_courses (batch_id, course_id, sort_order) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`, [batchIds[2], courseIds[1]]);
    console.log('Assigned courses to batches (batch_courses)');

    // ── Assignments ──────────────────────────────────
    const assignmentData = [
      [batchIds[0], 'SQL Basics Quiz', 'Write SELECT queries for the sample database. Submit as .sql file.', trainers[0], '2026-04-01'],
      [batchIds[0], 'JOIN Practice', 'Complete the JOIN exercises worksheet. Submit as .sql file.', trainers[0], '2026-04-15'],
      [batchIds[1], 'Pandas Data Cleaning', 'Clean the provided dataset using Pandas. Submit as .py file.', trainers[1], '2026-04-10'],
      [batchIds[2], 'AWS Architecture Diagram', 'Design a 3-tier architecture on AWS. Submit as .txt with description.', trainers[2], '2026-04-20'],
      [batchIds[3], 'React Todo App', 'Build a todo app with React hooks. Submit as .txt with repo link.', trainers[0], '2026-05-01'],
    ];
    for (const [bid, title, instr, createdBy, dueAt] of assignmentData) {
      await client.query(
        `INSERT INTO assignments (batch_id, title, instructions, created_by, due_at) VALUES ($1, $2, $3, $4, $5)`,
        [bid, title, instr, createdBy, dueAt]
      );
    }
    console.log('Added assignments');

    // ── IP Update Requests ───────────────────────────
    const ipData = [
      [students[0], '203.0.113.10', 'tcp', 1433, 'Need MSSQL access from home', 'approved', admin.id, 'Approved — home IP verified'],
      [students[1], '198.51.100.22', 'tcp', 5432, 'PostgreSQL access for lab work', 'approved', admin.id, 'Approved'],
      [students[2], '192.0.2.55', 'tcp', 1433, 'Office network access', 'pending', null, null],
      [students[3], '10.0.0.15', 'tcp', 5432, 'VPN access for remote work', 'pending', null, null],
      [students[4], '172.16.0.100', 'tcp', 1433, 'University lab access', 'rejected', admin.id, 'Private IP — use public IP instead'],
      [students[5], '203.0.113.50', 'tcp', 5432, 'Home network', 'approved', admin.id, 'Looks good'],
    ];
    for (const [sid, ip, proto, port, reason, status, reviewedBy, reviewNote] of ipData) {
      await client.query(
        `INSERT INTO ip_update_requests (student_id, requested_ip, protocol, port, reason, status, reviewed_at, reviewed_by, review_note)
         VALUES ($1, $2, $3, $4, $5, $6, ${status !== 'pending' ? 'NOW()' : 'NULL'}, $7, $8)`,
        [sid, ip, proto, port, reason, status, reviewedBy, reviewNote]
      );
    }
    console.log('Added IP requests');

    // ── Notifications ────────────────────────────────
    const notifData = [
      [admin.id, students[0], null, 'Welcome to SQL Fundamentals', 'Hi Arun, welcome to the SQL Fundamentals batch! Your first assignment is due Apr 1.'],
      [admin.id, students[1], null, 'Welcome to SQL Fundamentals', 'Hi Sneha, welcome to the SQL Fundamentals batch! Please complete your profile.'],
      [admin.id, null, 'student', 'Portal Maintenance Notice', 'The portal will be under maintenance on March 20, 2026 from 2AM-4AM IST. Please save your work.'],
      [trainers[0], students[0], null, 'Assignment Reminder', 'Hi Arun, please submit the SQL Basics Quiz before the deadline. Let me know if you have questions.'],
      [trainers[1], null, 'student', 'New Pandas Tutorial Available', 'A new tutorial video on Pandas data cleaning has been uploaded. Check the Batch Videos section.'],
      [students[0], admin.id, null, 'IP Request Query', 'Hi Admin, I submitted an IP request for my home network. Could you please review it at your earliest convenience?'],
      [students[2], admin.id, null, 'Batch Assignment Question', 'Hello, I would like to be added to the AWS batch as well. Is that possible?'],
      [admin.id, null, 'trainer', 'Monthly Report Due', 'Please submit your monthly batch progress reports by March 25, 2026.'],
    ];
    for (const [fromId, toId, toRole, subject, message] of notifData) {
      await client.query(
        `INSERT INTO notifications (from_user_id, to_user_id, to_role, subject, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [fromId, toId, toRole, subject, message]
      );
    }
    console.log('Added notifications');

    // ── Audit Logs ───────────────────────────────────
    const auditData = [
      [admin.id, 'admin.batch.create', 'batch', batchIds[0], { name: 'SQL Fundamentals - Batch 2026-A' }],
      [admin.id, 'admin.batch.create', 'batch', batchIds[1], { name: 'Python Data Science - Batch 2026-B' }],
      [admin.id, 'ip_request.approve', 'ip_update_request', null, { ip: '203.0.113.10', port: 1433 }],
      [admin.id, 'ip_request.approve', 'ip_update_request', null, { ip: '198.51.100.22', port: 5432 }],
      [admin.id, 'admin.student.update', 'user', students[0], { fullName: 'Arun Patel' }],
      [trainers[0], 'assignment.create', 'assignment', null, { title: 'SQL Basics Quiz' }],
    ];
    for (const [actor, action, entityType, entityId, metadata] of auditData) {
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [actor, action, entityType, entityId, JSON.stringify(metadata)]
      );
    }
    console.log('Added audit logs');

    await client.query('COMMIT');
    console.log('\n✅ Sample data seeded successfully!');
    console.log('\nLogin credentials (all accounts):');
    console.log('  Password: Test@1234');
    console.log('\nAccounts:');
    console.log('  Admin:    admin@tech2high.com');
    console.log('  Trainer:  trainer1@tech2high.com, trainer2@tech2high.com, trainer3@tech2high.com');
    console.log('  Students: student1@tech2high.com ... student12@tech2high.com');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((e) => { console.error(e); process.exit(1); });
