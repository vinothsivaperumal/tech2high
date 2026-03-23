const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgres://CHAMPS_PROD:champs123@champs.c6f6s4gm2f4p.us-east-1.rds.amazonaws.com:5432/student_portal'
});

async function hash(pw) {
  return bcrypt.hash(pw, 12);
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Clean existing data (FK-safe order) ──────────
    console.log('Cleaning existing data...');
    await client.query('DELETE FROM student_resume_projects');
    await client.query('DELETE FROM student_resume_skills');
    await client.query('DELETE FROM student_resume_experience');
    await client.query('DELETE FROM student_resume_education');
    await client.query('DELETE FROM student_resume_profiles');
    await client.query('DELETE FROM student_certifications');
    await client.query('DELETE FROM student_agreements');
    await client.query('DELETE FROM student_payments');
    await client.query('DELETE FROM audit_logs');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM assignment_submissions');
    await client.query('DELETE FROM assignments');
    await client.query('DELETE FROM ip_update_requests');
    await client.query('DELETE FROM video_mappings');
    await client.query('DELETE FROM course_videos');
    await client.query('DELETE FROM course_topics');
    await client.query('DELETE FROM batch_courses');
    await client.query('DELETE FROM program_courses');
    await client.query('DELETE FROM batch_trainers');
    await client.query('DELETE FROM batch_students');
    await client.query('DELETE FROM videos');
    await client.query('DELETE FROM batches');
    await client.query('DELETE FROM courses');
    await client.query('DELETE FROM programs');
    await client.query('DELETE FROM users');
    console.log('Cleaned.');

    // Hash the shared password: "Test@1234"
    const pw = await hash('Test@1234');

    // ══════════════════════════════════════════════════
    //  USERS
    // ══════════════════════════════════════════════════

    // ── Admin ────────────────────────────────────────
    const admin = (await client.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone, city, state, country, institute, experience_level)
       VALUES ($1, $2, 'admin', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      ['admin@tech2high.com', pw, 'Agathesh Velan', '(123) 456-7890', 'Chennai', 'Tamil Nadu', 'India', 'Tech2High', 'Expert']
    )).rows[0];
    console.log('Admin:', admin.id);

    // ── Trainers (3) ─────────────────────────────────
    const trainers = [];
    const trainerData = [
      ['trainer1@tech2high.com', 'Rajesh Kumar',  '(234) 567-8901', 'Bangalore',     'Karnataka',  'India',         'Tech2High Academy', 'Advanced'],
      ['trainer2@tech2high.com', 'Priya Sharma',  '(345) 678-9012', 'Hyderabad',     'Telangana',  'India',         'Tech2High Academy', 'Expert'],
      ['trainer3@tech2high.com', 'David Chen',    '(456) 789-0123', 'San Francisco', 'California', 'United States', 'Tech2High US',      'Advanced'],
    ];
    for (const [email, name, phone, city, state, country, inst, lvl] of trainerData) {
      const r = (await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, phone, city, state, country, institute, experience_level)
         VALUES ($1, $2, 'trainer', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [email, pw, name, phone, city, state, country, inst, lvl]
      )).rows[0];
      trainers.push(r.id);
      console.log('Trainer:', name, r.id);
    }

    // ── Students (25) ────────────────────────────────
    const students = [];
    const studentData = [
      ['student1@tech2high.com',  'Arun Patel',            '(111) 222-3333', 'Mumbai',        'Maharashtra',    'India',          'IIT Bombay',             'Beginner'],
      ['student2@tech2high.com',  'Sneha Reddy',           '(222) 333-4444', 'Chennai',       'Tamil Nadu',     'India',          'Anna University',        'Intermediate'],
      ['student3@tech2high.com',  'Mohammed Ali',          '(333) 444-5555', 'Delhi',         'Delhi',          'India',          'IIIT Delhi',             'Beginner'],
      ['student4@tech2high.com',  'Emily Johnson',         '(444) 555-6666', 'New York',      'New York',       'United States',  'NYU',                    'Advanced'],
      ['student5@tech2high.com',  'Sarah Williams',        '(555) 666-7777', 'London',        'England',        'United Kingdom', 'Imperial College',       'Intermediate'],
      ['student6@tech2high.com',  'Karthik Subramanian',   '(666) 777-8888', 'Coimbatore',    'Tamil Nadu',     'India',          'PSG Tech',               'Beginner'],
      ['student7@tech2high.com',  'Lisa Zhang',            '(777) 888-9999', 'Toronto',       'Ontario',        'Canada',         'University of Toronto',  'Advanced'],
      ['student8@tech2high.com',  'Vikram Singh',          '(888) 999-0000', 'Pune',          'Maharashtra',    'India',          'COEP',                   'Intermediate'],
      ['student9@tech2high.com',  'Ananya Gupta',          '(999) 000-1111', 'Kolkata',       'West Bengal',    'India',          'Jadavpur University',    'Expert'],
      ['student10@tech2high.com', 'James Brown',           '(101) 202-3030', 'Austin',        'Texas',          'United States',  'UT Austin',              'Beginner'],
      ['student11@tech2high.com', 'Deepika Nair',          '(102) 203-3040', 'Kochi',         'Kerala',         'India',          'NIT Calicut',            'Intermediate'],
      ['student12@tech2high.com', 'Rahul Verma',           '(103) 204-3050', 'Jaipur',        'Rajasthan',      'India',          'MNIT Jaipur',            'Beginner'],
      ['student13@tech2high.com', 'Meera Krishnan',        '(104) 205-3060', 'Trivandrum',    'Kerala',         'India',          'CET Trivandrum',         'Intermediate'],
      ['student14@tech2high.com', 'Rohit Deshmukh',        '(105) 206-3070', 'Nagpur',        'Maharashtra',    'India',          'VNIT Nagpur',            'Beginner'],
      ['student15@tech2high.com', 'Pooja Iyer',            '(106) 207-3080', 'Mysore',        'Karnataka',      'India',          'NIE Mysore',             'Advanced'],
      ['student16@tech2high.com', 'Suresh Babu',           '(107) 208-3090', 'Visakhapatnam', 'Andhra Pradesh', 'India',          'GITAM University',       'Intermediate'],
      ['student17@tech2high.com', 'Nisha Kapoor',          '(108) 209-3100', 'Chandigarh',    'Chandigarh',     'India',          'PEC Chandigarh',         'Beginner'],
      ['student18@tech2high.com', 'Arjun Menon',           '(109) 210-3110', 'Thrissur',      'Kerala',         'India',          'NIT Calicut',            'Expert'],
      ['student19@tech2high.com', 'Divya Saxena',          '(110) 211-3120', 'Lucknow',       'Uttar Pradesh',  'India',          'IIT Kanpur',             'Intermediate'],
      ['student20@tech2high.com', 'Santosh Joshi',         '(111) 212-3130', 'Indore',        'Madhya Pradesh', 'India',          'IIT Indore',             'Beginner'],
      ['student21@tech2high.com', 'Fatima Khan',           '(112) 213-3140', 'Bhopal',        'Madhya Pradesh', 'India',          'MANIT Bhopal',           'Advanced'],
      ['student22@tech2high.com', 'Ravi Shankar',          '(113) 214-3150', 'Patna',         'Bihar',          'India',          'NIT Patna',              'Intermediate'],
      ['student23@tech2high.com', 'Swathi Ramesh',         '(114) 215-3160', 'Salem',         'Tamil Nadu',     'India',          'GCE Salem',              'Beginner'],
      ['student24@tech2high.com', 'Daniel Thomas',         '(115) 216-3170', 'Chicago',       'Illinois',       'United States',  'University of Chicago',  'Advanced'],
      ['student25@tech2high.com', 'Lakshmi Venkatesh',     '(116) 217-3180', 'Madurai',       'Tamil Nadu',     'India',          'TCE Madurai',            'Intermediate'],
    ];
    for (const [email, name, phone, city, state, country, inst, lvl] of studentData) {
      const r = (await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, phone, city, state, country, institute, experience_level)
         VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [email, pw, name, phone, city, state, country, inst, lvl]
      )).rows[0];
      students.push(r.id);
      console.log('Student:', name, r.id);
    }

    // ══════════════════════════════════════════════════
    //  COURSES (8) — each with 3+ topics, 2+ videos per topic
    // ══════════════════════════════════════════════════

    const courseData = [
      ['SQL',                   'Complete SQL course covering basics through advanced query optimization, joins, subqueries, and window functions',                  'SQL-101',  '40 hours', 'Beginner'],
      ['Excel',                 'Master Microsoft Excel from formulas and pivot tables to data analysis, charts, and VBA macros',                                    'EXL-101',  '30 hours', 'Beginner'],
      ['Python',                'Python programming for data science — variables, data structures, Pandas, NumPy, and data visualization',                           'PY-101',   '50 hours', 'Intermediate'],
      ['ETL',                   'Extract, Transform, Load pipelines — data integration patterns, tools, scheduling, and error handling',                             'ETL-101',  '35 hours', 'Intermediate'],
      ['Tableau',               'Data visualization with Tableau — building dashboards, calculated fields, parameters, and storytelling',                            'TAB-101',  '30 hours', 'Beginner'],
      ['Data Governance',       'Data governance frameworks, data quality management, compliance (GDPR/CCPA), metadata management, and data catalogs',              'DG-101',   '25 hours', 'Advanced'],
      ['Interview Preparation', 'Technical interview preparation — coding challenges, system design, SQL problems, and whiteboard exercises',                       'INT-101',  '20 hours', 'Intermediate'],
      ['Soft-skill Preparation','Professional soft skills — communication, teamwork, leadership, time management, and workplace etiquette',                         'SS-101',   '15 hours', 'Beginner'],
    ];
    const courseIds = [];
    for (const [title, desc, code, duration, level] of courseData) {
      const r = (await client.query(
        `INSERT INTO courses (title, description, created_by, course_code, duration, level) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [title, desc, admin.id, code, duration, level]
      )).rows[0];
      courseIds.push(r.id);
      console.log('Course:', title, r.id);
    }
    // Alias for readability
    const [cSQL, cExcel, cPython, cETL, cTableau, cDataGov, cInterview, cSoftSkill] = courseIds;

    // ── Course Topics & Videos ───────────────────────
    const topicsAndVideos = [
      // 0: SQL
      [cSQL, [
        ['SQL Basics & SELECT', 0, [
          ['Introduction to SQL & Databases',     'https://www.youtube.com/watch?v=27axs9dO7AE', 0],
          ['SELECT Statement Fundamentals',       'https://www.youtube.com/watch?v=7S_tz1z_5bA', 1],
          ['WHERE Clause & Filtering',            'https://www.youtube.com/watch?v=m1KcNV-Zhmc', 2],
        ]],
        ['Joins & Subqueries', 1, [
          ['INNER, LEFT, RIGHT & FULL JOINs',     'https://www.youtube.com/watch?v=9yeOJ0ZMUYw', 0],
          ['Subqueries & Common Table Expressions','https://www.youtube.com/watch?v=Jh_pvk48jHA', 1],
        ]],
        ['Advanced SQL & Optimization', 2, [
          ['Window Functions & Analytics',        'https://www.youtube.com/watch?v=QFj-hZi8MKk', 0],
          ['Indexing & Query Optimization',       'https://www.youtube.com/watch?v=HubezKbFL7E', 1],
          ['Stored Procedures & Triggers',        'https://www.youtube.com/watch?v=NrBJmtD0kEw', 2],
        ]],
      ]],
      // 1: Excel
      [cExcel, [
        ['Excel Fundamentals', 0, [
          ['Excel Interface & Navigation',        'https://www.youtube.com/watch?v=rwbho0CgEAE', 0],
          ['Cell Formatting & Data Entry',        'https://www.youtube.com/watch?v=k1VUZEVuDJ8', 1],
        ]],
        ['Formulas & Functions', 1, [
          ['Essential Formulas (SUM, IF, VLOOKUP)','https://www.youtube.com/watch?v=fSVeyRtwSGw', 0],
          ['Advanced Functions (INDEX-MATCH)',     'https://www.youtube.com/watch?v=F264FpBDX28', 1],
          ['Pivot Tables & Pivot Charts',         'https://www.youtube.com/watch?v=qu-AK0Hv0b4', 2],
        ]],
        ['Data Analysis with Excel', 2, [
          ['Data Cleaning & Validation',          'https://www.youtube.com/watch?v=LMKsYT0djFQ', 0],
          ['Conditional Formatting & Charts',     'https://www.youtube.com/watch?v=K3FMuMT8jLc', 1],
        ]],
      ]],
      // 2: Python
      [cPython, [
        ['Python Basics', 0, [
          ['Variables, Data Types & Operators',   'https://www.youtube.com/watch?v=kqtD5dpn9C8', 0],
          ['Control Flow — Loops & Conditions',   'https://www.youtube.com/watch?v=DZwmZ8Usvnk', 1],
        ]],
        ['Data Structures', 1, [
          ['Lists, Tuples & Dictionaries',        'https://www.youtube.com/watch?v=gOMW_n2-2Mw', 0],
          ['Sets, Comprehensions & Generators',   'https://www.youtube.com/watch?v=bD05PaAsVBk', 1],
        ]],
        ['Python for Data Analysis', 2, [
          ['Pandas DataFrames & Series',          'https://www.youtube.com/watch?v=vmEHCJofslg', 0],
          ['Data Visualization with Matplotlib',  'https://www.youtube.com/watch?v=UO98lJQ3QGI', 1],
          ['NumPy Arrays & Operations',           'https://www.youtube.com/watch?v=QUT1VHiLmmI', 2],
        ]],
      ]],
      // 3: ETL
      [cETL, [
        ['ETL Concepts & Foundations', 0, [
          ['What is ETL? Overview & Use Cases',   'https://www.youtube.com/watch?v=OW5OgsLpDCQ', 0],
          ['ETL vs ELT — Key Differences',        'https://www.youtube.com/watch?v=voC0ewDeltA', 1],
        ]],
        ['Data Extraction & Transformation', 1, [
          ['Data Extraction from Multiple Sources','https://www.youtube.com/watch?v=gJzr_lceCwY', 0],
          ['Data Transformation Techniques',      'https://www.youtube.com/watch?v=K-MkXr0p3UM', 1],
          ['Data Quality & Error Handling',       'https://www.youtube.com/watch?v=ZS4zuGJt0_A', 2],
        ]],
        ['ETL Pipeline Design', 2, [
          ['Building Pipelines with Airflow',     'https://www.youtube.com/watch?v=AHMm1wfGuR4', 0],
          ['Scheduling, Monitoring & Logging',    'https://www.youtube.com/watch?v=PHsC_t0j1dU', 1],
        ]],
      ]],
      // 4: Tableau
      [cTableau, [
        ['Tableau Basics', 0, [
          ['Tableau Interface & Connecting Data', 'https://www.youtube.com/watch?v=jEgVto5QME8', 0],
          ['Building Your First Viz',             'https://www.youtube.com/watch?v=6xv1KvCMF1Q', 1],
        ]],
        ['Building Dashboards', 1, [
          ['Creating Interactive Dashboards',     'https://www.youtube.com/watch?v=aHaOIvR00So', 0],
          ['Filters, Parameters & Actions',       'https://www.youtube.com/watch?v=W5yFjmJYV_4', 1],
        ]],
        ['Advanced Visualizations', 2, [
          ['Calculated Fields & Table Calculations','https://www.youtube.com/watch?v=d6oezZrPHls', 0],
          ['Storytelling with Data',              'https://www.youtube.com/watch?v=r7BL-IEz3mM', 1],
          ['LOD Expressions',                     'https://www.youtube.com/watch?v=qTaIHLKROYE', 2],
        ]],
      ]],
      // 5: Data Governance
      [cDataGov, [
        ['Data Governance Fundamentals', 0, [
          ['What is Data Governance?',            'https://www.youtube.com/watch?v=d3qJMHgQbSI', 0],
          ['Governance Frameworks & Roles',       'https://www.youtube.com/watch?v=4LbMxY7OoEs', 1],
        ]],
        ['Data Quality & Compliance', 1, [
          ['Data Quality Management',             'https://www.youtube.com/watch?v=BBd84b9EWQY', 0],
          ['GDPR, CCPA & Regulatory Compliance',  'https://www.youtube.com/watch?v=acijNEErf-c', 1],
          ['Data Privacy & Security Controls',    'https://www.youtube.com/watch?v=WmRKZbWvgrM', 2],
        ]],
        ['Metadata Management', 2, [
          ['Data Catalogs & Lineage',             'https://www.youtube.com/watch?v=Sps6C-3LFQg', 0],
          ['Master Data Management (MDM)',        'https://www.youtube.com/watch?v=EU2T_JNOkJc', 1],
        ]],
      ]],
      // 6: Interview Preparation
      [cInterview, [
        ['Technical Interview Prep', 0, [
          ['SQL Interview Questions',             'https://www.youtube.com/watch?v=PM2MnMhGaOA', 0],
          ['Python Coding Challenges',            'https://www.youtube.com/watch?v=2ZLl8GAk1X4', 1],
        ]],
        ['Behavioral Questions', 1, [
          ['STAR Method for Behavioral Interviews','https://www.youtube.com/watch?v=WSbN-0swDgM', 0],
          ['Common Behavioral Questions & Answers','https://www.youtube.com/watch?v=1mHjMNZZvFo', 1],
        ]],
        ['Mock Interview Strategies', 2, [
          ['Whiteboard & System Design Interviews','https://www.youtube.com/watch?v=REB_eGHK_P4', 0],
          ['Body Language & Presentation Tips',   'https://www.youtube.com/watch?v=HAnw168huqA', 1],
          ['Salary Negotiation Techniques',       'https://www.youtube.com/watch?v=u9BoG1n1948', 2],
        ]],
      ]],
      // 7: Soft-skill Preparation
      [cSoftSkill, [
        ['Communication Skills', 0, [
          ['Effective Verbal Communication',      'https://www.youtube.com/watch?v=HAnw168huqA', 0],
          ['Business Email & Written Communication','https://www.youtube.com/watch?v=MvBzP06PEBg', 1],
        ]],
        ['Team Collaboration', 1, [
          ['Teamwork & Conflict Resolution',      'https://www.youtube.com/watch?v=W7h7i5wz3Lc', 0],
          ['Agile & Scrum for Teams',             'https://www.youtube.com/watch?v=2Vt7Ik8Ublw', 1],
        ]],
        ['Professional Etiquette', 2, [
          ['Workplace Professionalism',           'https://www.youtube.com/watch?v=qz61UHzDkZk', 0],
          ['Time Management & Productivity',      'https://www.youtube.com/watch?v=iONDebHX9qk', 1],
          ['LinkedIn Profile & Personal Branding','https://www.youtube.com/watch?v=zd4ALKv8Das', 2],
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
    console.log('Added 8 courses with 3+ topics each and 2-3 videos per topic');

    // ══════════════════════════════════════════════════
    //  PROGRAMS (3)
    // ══════════════════════════════════════════════════

    const programData = [
      ['Cloud Data Analysis',      'Comprehensive data analysis program covering SQL, Python, Excel, Tableau and Data Governance for cloud-based analytics',        'CDA-2026', '6 months', 'Data Analytics', '2026-01-15', '2026-07-15'],
      ['Interview Preparation',    'Complete interview readiness program — technical interview skills, behavioral questions, and professional soft skills',         'IP-2026',  '2 months', 'Career Skills',  '2026-03-01', '2026-04-30'],
      ['Data Engineering',         'End-to-end data engineering program covering ETL pipelines, SQL, and Python for building scalable data infrastructure',        'DE-2026',  '4 months', 'Engineering',    '2026-02-01', '2026-05-31'],
    ];
    const programIds = [];
    for (const [title, desc, code, duration, category, startDate, endDate] of programData) {
      const r = (await client.query(
        `INSERT INTO programs (title, description, created_by, program_code, duration, category, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [title, desc, admin.id, code, duration, category, startDate, endDate]
      )).rows[0];
      programIds.push(r.id);
      console.log('Program:', title, r.id);
    }
    const [pCloudData, pInterview, pDataEng] = programIds;

    // ── Program → Courses ────────────────────────────
    // Cloud Data Analysis: SQL, Python, Excel, Tableau, Data Governance
    const pcMappings = [
      [pCloudData, cSQL,      0],
      [pCloudData, cPython,   1],
      [pCloudData, cExcel,    2],
      [pCloudData, cTableau,  3],
      [pCloudData, cDataGov,  4],
      // Interview Preparation: Interview Prep, Soft-skill
      [pInterview, cInterview, 0],
      [pInterview, cSoftSkill, 1],
      // Data Engineering: ETL, SQL, Python
      [pDataEng,   cETL,    0],
      [pDataEng,   cSQL,    1],
      [pDataEng,   cPython, 2],
    ];
    for (const [pid, cid, sort] of pcMappings) {
      await client.query(
        `INSERT INTO program_courses (program_id, course_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [pid, cid, sort]
      );
    }
    console.log('Mapped courses to programs');

    // ══════════════════════════════════════════════════
    //  BATCHES (6) — distribute 25 students across 3 trainers
    // ══════════════════════════════════════════════════

    const batchData = [
      ['SQL Fundamentals - Batch 2026-A',   trainers[0], pCloudData, 'CDA-A', '2026-01-15', '2026-04-15', 30, 'online',  'Morning batch'],
      ['Python Data Science - Batch 2026-B',trainers[1], pCloudData, 'CDA-B', '2026-01-20', '2026-04-20', 30, 'online',  'Evening batch'],
      ['Data Engineering - Batch 2026-C',   trainers[2], pDataEng,   'DE-C',  '2026-02-01', '2026-05-31', 25, 'online',  'Weekend batch'],
      ['Cloud Analytics - Batch 2026-D',    trainers[0], pCloudData, 'CDA-D', '2026-03-01', '2026-06-30', 25, 'hybrid',  'Afternoon batch'],
      ['Interview Skills - Batch 2026-E',   trainers[1], pInterview, 'IP-E',  '2026-03-01', '2026-04-30', 20, 'online',  'Fast-track'],
      ['ETL Pipeline - Batch 2026-F',       trainers[2], pDataEng,   'DE-F',  '2026-03-15', '2026-06-15', 20, 'online',  'Evening batch'],
    ];
    const batchIds = [];
    for (const [name, trainerId, progId, code, start, end, cap, mode, remarks] of batchData) {
      const r = (await client.query(
        `INSERT INTO batches (name, trainer_id, program_id, batch_code, start_date, end_date, capacity, mode, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [name, trainerId, progId, code, start, end, cap, mode, remarks]
      )).rows[0];
      batchIds.push(r.id);
      console.log('Batch:', name, r.id);
    }
    const [bA, bB, bC, bD, bE, bF] = batchIds;

    // ── Assign students → batches ────────────────────
    // Each student in at least 1 batch; overlap allowed
    const batchStudents = [
      [bA, [0,1,2,3,4,5,6,7]],            // 8 students
      [bB, [3,4,5,8,9,10,11,12]],          // 8 students
      [bC, [6,7,13,14,15,16,17,18]],       // 8 students
      [bD, [0,8,15,19,20,21,22,23]],       // 8 students
      [bE, [1,2,9,10,17,19,20,24]],        // 8 students
      [bF, [11,12,13,14,21,22,23,24]],     // 8 students
    ];
    for (const [batchId, idxs] of batchStudents) {
      for (const i of idxs) {
        await client.query(
          `INSERT INTO batch_students (batch_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [batchId, students[i]]
        );
      }
    }
    console.log('Assigned 25 students to 6 batches');

    // ── Batch → Courses ──────────────────────────────
    const batchCourses = [
      [bA, [[cSQL, 0], [cExcel, 1]]],
      [bB, [[cPython, 0], [cTableau, 1], [cSQL, 2]]],
      [bC, [[cETL, 0], [cSQL, 1], [cPython, 2]]],
      [bD, [[cTableau, 0], [cDataGov, 1], [cExcel, 2]]],
      [bE, [[cInterview, 0], [cSoftSkill, 1]]],
      [bF, [[cETL, 0], [cPython, 1]]],
    ];
    for (const [batchId, courses] of batchCourses) {
      for (const [cid, sort] of courses) {
        await client.query(
          `INSERT INTO batch_courses (batch_id, course_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [batchId, cid, sort]
        );
      }
    }
    console.log('Assigned courses to batches');

    // ── Batch Trainers (many-to-many) ────────────────
    for (let i = 0; i < batchIds.length; i++) {
      const t = batchData[i][1]; // primary trainer
      await client.query(
        `INSERT INTO batch_trainers (batch_id, trainer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [batchIds[i], t]
      );
    }
    console.log('Linked batch_trainers');

    // ══════════════════════════════════════════════════
    //  BATCH VIDEOS (YouTube)
    // ══════════════════════════════════════════════════

    const videoData = [
      [bA, 'SQL SELECT Basics',                  'Learn the fundamentals of SELECT queries',                  'https://www.youtube.com/watch?v=7S_tz1z_5bA'],
      [bA, 'SQL JOINs Explained',                'Understanding INNER, LEFT, RIGHT and FULL joins',           'https://www.youtube.com/watch?v=9yeOJ0ZMUYw'],
      [bA, 'Excel Pivot Tables',                 'Mastering Pivot Tables for data analysis',                  'https://www.youtube.com/watch?v=qu-AK0Hv0b4'],
      [bB, 'Python for Beginners',               'Getting started with Python programming',                   'https://www.youtube.com/watch?v=kqtD5dpn9C8'],
      [bB, 'Pandas DataFrame Tutorial',          'Data manipulation with Pandas',                             'https://www.youtube.com/watch?v=vmEHCJofslg'],
      [bC, 'ETL Pipeline with Airflow',          'Building your first ETL pipeline using Apache Airflow',     'https://www.youtube.com/watch?v=AHMm1wfGuR4'],
      [bC, 'SQL for Data Engineers',             'Advanced SQL for data engineering workflows',                'https://www.youtube.com/watch?v=QFj-hZi8MKk'],
      [bD, 'Tableau Dashboard Masterclass',      'End-to-end dashboard creation in Tableau',                  'https://www.youtube.com/watch?v=aHaOIvR00So'],
      [bE, 'Technical Interview Tips',           'Ace your data analyst technical interview',                 'https://www.youtube.com/watch?v=PM2MnMhGaOA'],
      [bE, 'STAR Method for Interviews',         'Answering behavioral questions using STAR method',          'https://www.youtube.com/watch?v=WSbN-0swDgM'],
      [bF, 'Python ETL Scripting',               'Writing ETL scripts in Python for real-world datasets',     'https://www.youtube.com/watch?v=gJzr_lceCwY'],
    ];
    for (const [bid, title, desc, url] of videoData) {
      await client.query(
        `INSERT INTO videos (batch_id, title, description, youtube_url, s3_key, uploaded_by) VALUES ($1, $2, $3, $4, '', $5)`,
        [bid, title, desc, url, admin.id]
      );
    }
    console.log('Added 11 batch videos');

    // ══════════════════════════════════════════════════
    //  ASSIGNMENTS
    // ══════════════════════════════════════════════════

    const assignmentData = [
      [bA, 'SQL Basics Quiz',               'Write SELECT queries for the sample database. Submit as .sql file.',                    trainers[0], '2026-04-01'],
      [bA, 'JOIN Practice',                 'Complete the JOIN exercises worksheet. Submit as .sql file.',                            trainers[0], '2026-04-15'],
      [bB, 'Pandas Data Cleaning',          'Clean the provided dataset using Pandas. Submit as .py file.',                          trainers[1], '2026-04-10'],
      [bB, 'Tableau Dashboard Project',     'Create a sales dashboard in Tableau. Submit workbook or screenshots.',                  trainers[1], '2026-04-25'],
      [bC, 'ETL Pipeline Exercise',         'Design a simple ETL pipeline. Submit as .py with documentation.',                       trainers[2], '2026-04-20'],
      [bC, 'SQL Window Functions Lab',      'Solve the window functions worksheet. Submit as .sql file.',                            trainers[2], '2026-05-01'],
      [bD, 'Data Governance Case Study',    'Analyze the provided case study on data governance. Submit as .txt.',                   trainers[0], '2026-05-10'],
      [bE, 'Mock Interview Recording',      'Record a mock interview session. Submit as .txt with link.',                            trainers[1], '2026-04-15'],
      [bF, 'ETL Error Handling Project',    'Build an ETL pipeline with error handling. Submit as .py file.',                        trainers[2], '2026-05-15'],
    ];
    for (const [bid, title, instr, createdBy, dueAt] of assignmentData) {
      await client.query(
        `INSERT INTO assignments (batch_id, title, instructions, created_by, due_at) VALUES ($1, $2, $3, $4, $5)`,
        [bid, title, instr, createdBy, dueAt]
      );
    }
    console.log('Added 9 assignments');

    // ══════════════════════════════════════════════════
    //  IP UPDATE REQUESTS
    // ══════════════════════════════════════════════════

    const ipData = [
      [students[0],  '203.0.113.10',  'tcp', 1433, 'Need MSSQL access from home',      'approved', admin.id, 'Approved — home IP verified'],
      [students[1],  '198.51.100.22', 'tcp', 5432, 'PostgreSQL access for lab work',    'approved', admin.id, 'Approved'],
      [students[2],  '192.0.2.55',    'tcp', 1433, 'Office network access',             'pending',  null,     null],
      [students[3],  '10.0.0.15',     'tcp', 5432, 'VPN access for remote work',        'pending',  null,     null],
      [students[4],  '172.16.0.100',  'tcp', 1433, 'University lab access',             'rejected', admin.id, 'Private IP — use public IP instead'],
      [students[5],  '203.0.113.50',  'tcp', 5432, 'Home network',                      'approved', admin.id, 'Looks good'],
      [students[13], '198.51.100.77', 'tcp', 1433, 'College lab access at VNIT',        'pending',  null,     null],
      [students[18], '203.0.113.88',  'tcp', 5432, 'Apartment WiFi for ETL practice',   'approved', admin.id, 'Verified, added'],
      [students[24], '192.0.2.99',    'tcp', 1433, 'Library network at TCE Madurai',    'pending',  null,     null],
    ];
    for (const [sid, ip, proto, port, reason, status, reviewedBy, reviewNote] of ipData) {
      await client.query(
        `INSERT INTO ip_update_requests (student_id, requested_ip, protocol, port, reason, status, reviewed_at, reviewed_by, review_note)
         VALUES ($1, $2, $3, $4, $5, $6, ${status !== 'pending' ? 'NOW()' : 'NULL'}, $7, $8)`,
        [sid, ip, proto, port, reason, status, reviewedBy, reviewNote]
      );
    }
    console.log('Added 9 IP requests');

    // ══════════════════════════════════════════════════
    //  NOTIFICATIONS
    // ══════════════════════════════════════════════════

    const notifData = [
      [admin.id,     students[0], null,      'Welcome to SQL Fundamentals',       'Hi Arun, welcome to the SQL Fundamentals batch! Your first assignment is due Apr 1.'],
      [admin.id,     students[1], null,      'Welcome to SQL Fundamentals',       'Hi Sneha, welcome! Please complete your profile in the portal.'],
      [admin.id,     null,        'student', 'Portal Maintenance Notice',         'The portal will be under maintenance on March 25, 2026 from 2AM-4AM IST.'],
      [admin.id,     null,        'student', 'New Courses Available',             'We have added Tableau and Data Governance courses. Check the Courses section!'],
      [trainers[0],  students[0], null,      'Assignment Reminder',               'Hi Arun, please submit the SQL Basics Quiz before the deadline.'],
      [trainers[1],  null,        'student', 'New Pandas Tutorial',               'A new video on Pandas data cleaning has been uploaded to Batch 2026-B.'],
      [trainers[2],  students[13],null,      'ETL Pipeline Feedback',             'Hi Rohit, your ETL submission was good. Please add error handling.'],
      [students[0],  admin.id,    null,      'IP Request Query',                  'Hi Admin, I submitted an IP request for my home network. Could you review it?'],
      [students[2],  admin.id,    null,      'Batch Transfer Request',            'Hello, I would like to be added to the Data Engineering batch as well.'],
      [students[18], trainers[2], null,      'ETL Assignment Question',           'Hi David, can we use Python or should we use Airflow for the ETL assignment?'],
      [admin.id,     null,        'trainer', 'Monthly Report Due',                'Please submit your monthly batch progress reports by March 25, 2026.'],
      [admin.id,     students[24],null,      'Welcome to Interview Skills Batch', 'Hi Lakshmi, you have been enrolled in the Interview Skills batch. Good luck!'],
    ];
    for (const [fromId, toId, toRole, subject, message] of notifData) {
      await client.query(
        `INSERT INTO notifications (from_user_id, to_user_id, to_role, subject, message) VALUES ($1, $2, $3, $4, $5)`,
        [fromId, toId, toRole, subject, message]
      );
    }
    console.log('Added 12 notifications');

    // ══════════════════════════════════════════════════
    //  PAYMENTS (15 records — mixed statuses)
    // ══════════════════════════════════════════════════

    const paymentData = [
      // [studentIdx, batchId, amount, paidAmount, dueDate, paidDate, status, method, remarks]
      [0,  bA, 50000, 50000, '2026-01-15', '2026-01-10', 'paid',    'bank_transfer', 'Full payment received'],
      [1,  bA, 50000, 50000, '2026-01-15', '2026-01-14', 'paid',    'upi',           'Paid via GPay'],
      [2,  bA, 50000, 25000, '2026-01-15', '2026-01-12', 'partial', 'bank_transfer', 'First installment paid'],
      [3,  bB, 55000, 55000, '2026-01-20', '2026-01-18', 'paid',    'credit_card',   'Full payment'],
      [4,  bB, 55000, 0,     '2026-01-20', null,         'overdue', null,            'No payment received yet'],
      [5,  bB, 55000, 30000, '2026-01-20', '2026-01-25', 'partial', 'upi',           'Partial — balance due by Feb'],
      [6,  bC, 60000, 60000, '2026-02-01', '2026-01-28', 'paid',    'bank_transfer', 'Early payment'],
      [7,  bC, 60000, 0,     '2026-02-01', null,         'pending', null,            'Awaiting payment'],
      [8,  bD, 50000, 50000, '2026-03-01', '2026-02-28', 'paid',    'upi',           'Paid'],
      [9,  bB, 55000, 20000, '2026-01-20', '2026-02-05', 'partial', 'bank_transfer', 'First installment — EMI plan'],
      [13, bC, 60000, 0,     '2026-02-01', null,         'overdue', null,            'Multiple reminders sent'],
      [15, bD, 50000, 50000, '2026-03-01', '2026-03-01', 'paid',    'credit_card',   'Paid on due date'],
      [19, bD, 50000, 0,     '2026-03-01', null,         'pending', null,            'Awaiting scholarship confirmation'],
      [17, bE, 25000, 25000, '2026-03-01', '2026-02-25', 'paid',    'upi',           'Paid in advance'],
      [24, bF, 60000, 35000, '2026-03-15', '2026-03-10', 'partial', 'bank_transfer', 'Second installment due Apr'],
    ];
    for (const [sIdx, bid, amt, paid, due, paidDate, status, method, remarks] of paymentData) {
      await client.query(
        `INSERT INTO student_payments (student_id, batch_id, amount, paid_amount, due_date, paid_date, status, method, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7::payment_status, $8, $9)`,
        [students[sIdx], bid, amt, paid, due, paidDate, status, method, remarks]
      );
    }
    console.log('Added 15 payment records');

    // ══════════════════════════════════════════════════
    //  AGREEMENTS (12 records — mixed statuses)
    // ══════════════════════════════════════════════════

    const agreementData = [
      // [studentIdx, batchId, type, status, sentDate, signedDate, expiryDate]
      [0,  bA, 'training',    'signed',   '2026-01-05', '2026-01-08', '2027-01-08'],
      [1,  bA, 'training',    'signed',   '2026-01-05', '2026-01-10', '2027-01-10'],
      [2,  bA, 'training',    'sent',     '2026-01-05', null,         '2027-01-05'],
      [3,  bB, 'training',    'signed',   '2026-01-10', '2026-01-12', '2027-01-12'],
      [4,  bB, 'training',    'rejected', '2026-01-10', null,         null],
      [5,  bB, 'nda',         'signed',   '2026-01-10', '2026-01-15', '2027-01-15'],
      [6,  bC, 'training',    'sent',     '2026-01-25', null,         '2027-01-25'],
      [7,  bC, 'training',    'not_sent', null,         null,         null],
      [8,  bD, 'training',    'signed',   '2026-02-20', '2026-02-22', '2027-02-22'],
      [13, bC, 'training',    'expired',  '2025-01-01', '2025-01-05', '2026-01-05'],
      [19, bD, 'training',    'not_sent', null,         null,         null],
      [24, bF, 'training',    'sent',     '2026-03-10', null,         '2027-03-10'],
    ];
    for (const [sIdx, bid, type, status, sent, signed, expiry] of agreementData) {
      await client.query(
        `INSERT INTO student_agreements (student_id, batch_id, agreement_type, status, sent_date, signed_date, expiry_date)
         VALUES ($1, $2, $3, $4::agreement_status, $5, $6, $7)`,
        [students[sIdx], bid, type, status, sent, signed, expiry]
      );
    }
    console.log('Added 12 agreement records');

    // ══════════════════════════════════════════════════
    //  CERTIFICATIONS (10 records — mixed statuses)
    // ══════════════════════════════════════════════════

    const certData = [
      // [studentIdx, batchId, courseId, programId, completionPct, status, issueDate]
      [0,  bA, cSQL,      pCloudData, 100, 'issued',       '2026-03-15'],
      [1,  bA, cSQL,      pCloudData, 85,  'eligible',     null],
      [3,  bB, cPython,   pCloudData, 100, 'issued',       '2026-03-10'],
      [6,  bC, cETL,      pDataEng,   90,  'eligible',     null],
      [7,  bC, cSQL,      pDataEng,   45,  'not_eligible', null],
      [8,  bD, cTableau,  pCloudData, 100, 'issued',       '2026-03-18'],
      [9,  bB, cPython,   pCloudData, 70,  'not_eligible', null],
      [15, bD, cDataGov,  pCloudData, 95,  'eligible',     null],
      [18, bC, cPython,   pDataEng,   100, 'issued',       '2026-03-12'],
      [0,  bA, cExcel,    pCloudData, 100, 'revoked',      '2026-02-01'],
    ];
    for (const [sIdx, bid, cid, pid, pct, status, issueDate] of certData) {
      await client.query(
        `INSERT INTO student_certifications (student_id, batch_id, course_id, program_id, completion_pct, status, issue_date)
         VALUES ($1, $2, $3, $4, $5, $6::certification_status, $7)`,
        [students[sIdx], bid, cid, pid, pct, status, issueDate]
      );
    }
    console.log('Added 10 certification records');

    // ══════════════════════════════════════════════════
    //  RESUME PROFILES (8 students) + education / experience / skills / projects
    // ══════════════════════════════════════════════════

    const resumeStudents = [0, 1, 3, 6, 8, 15, 18, 24];
    const resumeStatuses = ['submitted', 'approved', 'in_progress', 'submitted', 'approved', 'changes_requested', 'in_progress', 'not_started'];
    const resumeRoles = ['Data Analyst', 'Data Analyst', 'Data Scientist', 'Data Engineer', 'Senior Data Analyst', 'BI Analyst', 'ETL Developer', 'Data Analyst'];

    for (let r = 0; r < resumeStudents.length; r++) {
      const sid = students[resumeStudents[r]];
      await client.query(
        `INSERT INTO student_resume_profiles (student_id, linkedin_url, github_url, portfolio_url, preferred_role, work_authorization, status, admin_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7::resume_status, $8)`,
        [
          sid,
          `https://linkedin.com/in/student${resumeStudents[r] + 1}`,
          `https://github.com/student${resumeStudents[r] + 1}`,
          resumeStudents[r] % 2 === 0 ? `https://student${resumeStudents[r] + 1}.dev` : null,
          resumeRoles[r],
          r < 5 ? 'Authorized' : 'Requires Sponsorship',
          resumeStatuses[r],
          resumeStatuses[r] === 'changes_requested' ? 'Please add project descriptions and update skills section.' : null
        ]
      );
    }
    console.log('Added 8 resume profiles');

    // Education
    const eduData = [
      [students[0],  'IIT Bombay',           'B.Tech', 'Computer Science',    2020, 2024, '8.5 CGPA'],
      [students[1],  'Anna University',      'B.E.',   'Information Technology',2019, 2023, '8.2 CGPA'],
      [students[3],  'NYU',                  'M.S.',   'Data Science',         2022, 2024, '3.8 GPA'],
      [students[3],  'Delhi University',     'B.Sc.',  'Statistics',           2018, 2021, '3.5 GPA'],
      [students[6],  'NIT Calicut',          'B.Tech', 'ECE',                 2018, 2022, '8.0 CGPA'],
      [students[8],  'Jadavpur University',  'M.Tech', 'Data Science',        2021, 2023, '9.1 CGPA'],
      [students[15], 'GITAM University',     'B.Tech', 'CSE',                 2019, 2023, '7.8 CGPA'],
      [students[18], 'IIT Kanpur',           'M.Tech', 'Computer Science',    2020, 2022, '8.9 CGPA'],
      [students[24], 'TCE Madurai',          'B.E.',   'CSE',                 2020, 2024, '8.0 CGPA'],
    ];
    for (const [sid, inst, deg, field, sy, ey, grade] of eduData) {
      await client.query(
        `INSERT INTO student_resume_education (student_id, institution, degree, field_of_study, start_year, end_year, grade)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sid, inst, deg, field, sy, ey, grade]
      );
    }
    console.log('Added resume education');

    // Experience
    const expData = [
      [students[0],  'TCS',              'Analyst',              '2024-06-01', null,         'Analyzing business data for retail clients.'],
      [students[1],  'Infosys',          'Junior Data Analyst',  '2023-07-01', null,         'Building dashboards and ETL pipelines.'],
      [students[3],  'Bloomberg',        'Data Science Intern',  '2024-05-01', '2024-08-31', 'Built ML models for financial data.'],
      [students[6],  'Wipro',            'Software Engineer',    '2022-07-01', '2025-12-31', 'Developed backend APIs and data pipelines.'],
      [students[8],  'Amazon',           'Data Analyst',         '2023-08-01', null,         'Analyzed seller performance metrics.'],
      [students[18], 'Flipkart',         'ETL Developer',        '2022-09-01', '2025-06-30', 'Built Apache Airflow DAGs for data ingestion.'],
    ];
    for (const [sid, comp, title, start, end, desc] of expData) {
      await client.query(
        `INSERT INTO student_resume_experience (student_id, company, title, start_date, end_date, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sid, comp, title, start, end, desc]
      );
    }
    console.log('Added resume experience');

    // Skills (3-5 per student)
    const skillData = [
      [students[0],  [['SQL','Advanced'], ['Python','Intermediate'], ['Excel','Advanced'], ['Tableau','Beginner']]],
      [students[1],  [['SQL','Intermediate'], ['Python','Intermediate'], ['Power BI','Beginner']]],
      [students[3],  [['Python','Advanced'], ['R','Intermediate'], ['SQL','Advanced'], ['Machine Learning','Intermediate'], ['Tableau','Advanced']]],
      [students[6],  [['Java','Advanced'], ['SQL','Intermediate'], ['Python','Intermediate'], ['AWS','Beginner']]],
      [students[8],  [['SQL','Expert'], ['Python','Advanced'], ['Excel','Advanced'], ['Tableau','Intermediate']]],
      [students[15], [['SQL','Intermediate'], ['Excel','Intermediate'], ['Tableau','Beginner']]],
      [students[18], [['Python','Advanced'], ['Apache Airflow','Intermediate'], ['SQL','Advanced'], ['ETL','Advanced']]],
      [students[24], [['SQL','Beginner'], ['Python','Beginner'], ['Excel','Intermediate']]],
    ];
    for (const [sid, skills] of skillData) {
      for (const [name, prof] of skills) {
        await client.query(
          `INSERT INTO student_resume_skills (student_id, skill_name, proficiency) VALUES ($1, $2, $3)`,
          [sid, name, prof]
        );
      }
    }
    console.log('Added resume skills');

    // Projects (1-2 per student)
    const projData = [
      [students[0],  'Sales Dashboard',        'Interactive Tableau dashboard for retail sales analysis',       'Tableau, SQL, Excel',    null],
      [students[0],  'Customer Segmentation',  'K-means clustering on customer purchase data',                 'Python, Pandas, Sklearn',null],
      [students[1],  'Inventory Tracker',       'Excel-based inventory management system with macros',          'Excel, VBA',             null],
      [students[3],  'Stock Price Predictor',   'LSTM neural network for stock price forecasting',              'Python, TensorFlow, Pandas', 'https://github.com/student4/stock-predictor'],
      [students[6],  'REST API Framework',      'Reusable REST API framework with JWT auth',                   'Java, Spring Boot',      'https://github.com/student7/api-framework'],
      [students[8],  'Marketplace Analytics',   'Seller performance analytics dashboard',                      'SQL, Python, Tableau',   null],
      [students[18], 'Data Pipeline Orchestrator','Automated ETL pipeline with Airflow for e-commerce data',   'Python, Airflow, PostgreSQL', 'https://github.com/student19/etl-orchestrator'],
    ];
    for (const [sid, title, desc, tech, url] of projData) {
      await client.query(
        `INSERT INTO student_resume_projects (student_id, title, description, tech_stack, url) VALUES ($1, $2, $3, $4, $5)`,
        [sid, title, desc, tech, url]
      );
    }
    console.log('Added resume projects');

    // ══════════════════════════════════════════════════
    //  AUDIT LOGS (18 entries)
    // ══════════════════════════════════════════════════

    const auditData = [
      [admin.id,     'admin.program.create',      'program',           programIds[0], { title: 'Cloud Data Analysis' }],
      [admin.id,     'admin.program.create',      'program',           programIds[1], { title: 'Interview Preparation' }],
      [admin.id,     'admin.program.create',      'program',           programIds[2], { title: 'Data Engineering' }],
      [admin.id,     'admin.batch.create',         'batch',             batchIds[0],   { name: 'SQL Fundamentals - Batch 2026-A' }],
      [admin.id,     'admin.batch.create',         'batch',             batchIds[1],   { name: 'Python Data Science - Batch 2026-B' }],
      [admin.id,     'admin.batch.create',         'batch',             batchIds[2],   { name: 'Data Engineering - Batch 2026-C' }],
      [admin.id,     'admin.batch.create',         'batch',             batchIds[3],   { name: 'Cloud Analytics - Batch 2026-D' }],
      [admin.id,     'admin.batch.create',         'batch',             batchIds[4],   { name: 'Interview Skills - Batch 2026-E' }],
      [admin.id,     'admin.batch.create',         'batch',             batchIds[5],   { name: 'ETL Pipeline - Batch 2026-F' }],
      [admin.id,     'ip_request.approve',         'ip_update_request', null,          { ip: '203.0.113.10', port: 1433 }],
      [admin.id,     'ip_request.approve',         'ip_update_request', null,          { ip: '198.51.100.22', port: 5432 }],
      [admin.id,     'ip_request.reject',          'ip_update_request', null,          { ip: '172.16.0.100', port: 1433, reason: 'Private IP' }],
      [admin.id,     'admin.student.update',       'user',              students[0],   { fullName: 'Arun Patel', field: 'experience_level' }],
      [admin.id,     'admin.payment.create',       'payment',           null,          { studentId: students[0], amount: 50000 }],
      [admin.id,     'admin.agreement.create',     'agreement',         null,          { studentId: students[0], type: 'training' }],
      [admin.id,     'admin.certification.create', 'certification',     null,          { studentId: students[0], course: 'SQL', status: 'issued' }],
      [trainers[0],  'assignment.create',          'assignment',        null,          { title: 'SQL Basics Quiz', batch: 'Batch 2026-A' }],
      [trainers[1],  'assignment.create',          'assignment',        null,          { title: 'Pandas Data Cleaning', batch: 'Batch 2026-B' }],
    ];
    for (const [actor, action, entityType, entityId, metadata] of auditData) {
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [actor, action, entityType, entityId, JSON.stringify(metadata)]
      );
    }
    console.log('Added 18 audit logs');

    // ══════════════════════════════════════════════════

    await client.query('COMMIT');

    console.log('\n✅ Sample data seeded successfully!');
    console.log('\n── Summary ──────────────────────────────');
    console.log('  Users:          1 admin + 3 trainers + 25 students = 29');
    console.log('  Programs:       3 (Cloud Data Analysis, Interview Preparation, Data Engineering)');
    console.log('  Courses:        8 (SQL, Excel, Python, ETL, Tableau, Data Governance, Interview Prep, Soft-skill)');
    console.log('  Topics:         24 (3 per course)');
    console.log('  Course Videos:  ~60 (2-3 per topic)');
    console.log('  Batches:        6');
    console.log('  Batch Videos:   11');
    console.log('  Assignments:    9');
    console.log('  IP Requests:    9');
    console.log('  Notifications:  12');
    console.log('  Payments:       15');
    console.log('  Agreements:     12');
    console.log('  Certifications: 10');
    console.log('  Resume Profiles:8 (with education, experience, skills, projects)');
    console.log('  Audit Logs:     18');
    console.log('\n── Login ────────────────────────────────');
    console.log('  Password (all accounts): Test@1234');
    console.log('  Admin:    admin@tech2high.com');
    console.log('  Trainers: trainer1@tech2high.com ... trainer3@tech2high.com');
    console.log('  Students: student1@tech2high.com ... student25@tech2high.com');
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
