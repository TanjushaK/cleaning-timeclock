import React, { useEffect, useState } from 'react';

const AppPage: React.FC = () => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchJobs = async () => {
            try {
                const response = await fetch('/api/jobs');
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                const data = await response.json();
                setJobs(data);
            } catch (err) {
                setError('Failed to fetch jobs.');
            }
        };
        fetchJobs();
    }, []);

    const handleJobStatus = (status: JobStatus) => {
        // Improved type safety here
        return jobs.filter(job => job.status === status);
    };

    const sanitizeHTML = (html: string) => {
        const tempDiv = document.createElement('div');
        tempDiv.innerText = html;  // Basic HTML sanitization
        return tempDiv.innerHTML;
    };

    const renderProfile = () => {
        return jobs.map(job => (
            <div key={job.id} className="profile">
                <h3>{sanitizeHTML(job.title)}</h3>
                <button className="bg-amber-500 hover:bg-amber-500/10">Apply</button>
            </div>
        ));
    };

    return (
        <div>
            <h1>Job Listings</h1>
            {error ? <div className="error">{error}</div> : renderProfile()}
        </div>
    );
};

export default AppPage;