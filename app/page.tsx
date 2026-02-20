import React from 'react';

const JobStatus = ({ status }) => {
    // Improved error handling for JSON parsing
    let parsedStatus;
    try {
        parsedStatus = JSON.parse(status);
    } catch (error) {
        console.error('Failed to parse status:', error);
        return <div>Error parsing status</div>;
    }

    // Better type safety for JobStatus filtering
    if (!['pending', 'completed', 'failed'].includes(parsedStatus)) {
        return <div>Unknown job status</div>;
    }

    return <div className={`job-status ${parsedStatus}`}>{parsedStatus}</div>;
};

const ProfileSettings = ({ userData }) => {
    // Proper sanitization and escaping of user data
    const sanitizedUserData = {
        name: escape(userData.name),
        email: escape(userData.email),
    };

    // Simplified profile setting logic
    const handleUpdate = () => {
        // Update logic here
    };

    return (
        <div>
            <h2>Profile Settings</h2>
            <input type="text" value={sanitizedUserData.name} onChange={handleUpdate} />
            <input type="email" value={sanitizedUserData.email} onChange={handleUpdate} />
            <button onClick={handleUpdate}>Update</button>
        </div>
    );
};

export default function App() {
    return (
        <div className='app p-4 hover:to-amber-500/10'>
            <JobStatus status='{"status": "pending"}' />
            <ProfileSettings userData={{ name: 'John Doe', email: 'john@example.com' }} />
        </div>
    );
}