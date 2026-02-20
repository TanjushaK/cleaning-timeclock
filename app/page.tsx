'use client'

import React, { useEffect, useState } from 'react';

type JobStatus = 'planned' | 'in_progress' | 'done' | 'cancelled' | string

type Job = {
    id: string
    title?: string | null
    status?: JobStatus | null
}

const AppPage: React.FC = () => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchJobs = async () => {
            try {
                const response = await fetch('/api/admin/jobs');
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                const data = await response.json();
                setJobs(data.jobs ?? []);
            } catch {
                setError('Failed to fetch jobs.');
            }
        };
        fetchJobs();
    }, []);

    const renderProfile = () => {
        return jobs.map(job => (
            <div key={job.id} className="profile">
                <h3>{job.title ?? 'Untitled'}</h3>
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