import React from 'react';

const LandingPage = () => {
  return (
    <div className="font-sans text-gray-900">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-4 bg-white shadow-md sticky top-0 z-50">
        <div className="text-2xl font-bold text-teal-600 flex items-center space-x-1">
          <span>Techpi</span>
          <span className="text-black">x</span>
          <span className="text-teal-600">o</span>
        </div>
        <ul className="flex space-x-8 text-gray-700 font-medium text-sm">
          {['Home', 'About', 'Portfolio', 'Services', 'Career', 'Contact'].map((item) => (
            <li key={item} className="hover:text-teal-600 cursor-pointer">{item}</li>
          ))}
        </ul>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-teal-500 text-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-8 py-20 flex flex-col md:flex-row items-center">
          <div className="md:w-1/2 space-y-6">
            <h1 className="text-5xl font-extrabold leading-tight">
              Crafting{' '}
              <span className="relative inline-block">
                <span className="bg-white text-teal-600 rounded-lg px-3">visuals</span>
              </span>{' '}
              that speak louder
              <br />
              then words
            </h1>
            <p className="text-sm font-light max-w-md">
              Joyory is a digital solution for a design agency that relates people relations, story development.
            </p>
            <button className="bg-white text-teal-600 font-semibold px-6 py-2 rounded shadow hover:bg-gray-100 transition">
              SCHEDULE A CALL &rarr;
            </button>
          </div>
          <div className="md:w-1/2 relative mt-12 md:mt-0 flex justify-center">
            {/* Cartoon character holding light bulb */}
            <div className="relative w-64 h-64">
              {/* Placeholder for cartoon character */}
              <svg
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full"
              >
                <circle cx="100" cy="100" r="100" fill="#00a9b7" />
                <rect x="70" y="50" width="60" height="100" rx="20" fill="#e0e0e0" />
                <circle cx="100" cy="40" r="30" fill="#f0f0f0" />
                <circle cx="90" cy="35" r="5" fill="#000" />
                <circle cx="110" cy="35" r="5" fill="#000" />
                <path d="M80 140 Q100 160 120 140" stroke="#000" strokeWidth="3" fill="none" />
                {/* Light bulb */}
                <circle cx="160" cy="40" r="30" fill="#b0e0e6" />
                <rect x="150" y="70" width="20" height="40" fill="#f0f0f0" />
              </svg>
              <div className="absolute bottom-0 right-0 bg-white text-teal-600 text-xs px-2 py-1 rounded shadow">
                Switch on the Rocket Bulb
              </div>
            </div>
          </div>
        </div>
        {/* White cloud shaped divider */}
        <div className="absolute bottom-0 left-0 right-0 -mb-1">
          <svg
            viewBox="0 0 1440 100"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-24"
            preserveAspectRatio="none"
          >
            <path
              fill="#ffffff"
              d="M0,96L48,90.7C96,85,192,75,288,80C384,85,480,107,576,117.3C672,128,768,128,864,117.3C960,107,1056,85,1152,80C1248,75,1344,85,1392,90.7L1440,96L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z"
            />
          </svg>
        </div>
      </section>

      {/* Who We Are Section */}
      <section className="bg-white py-16 px-8 max-w-4xl mx-auto text-center">
        <p className="text-teal-500 font-semibold tracking-widest mb-2">WHO WE ARE</p>
        <h2 className="text-2xl font-semibold mb-4 max-w-3xl mx-auto">
          Techpixo is a vibrant design agency focused on connecting people with{' '}
          <strong>innovative products</strong>. We excel in storytelling and provide a range of creative
          services that inspire our clients.
        </h2>
        <button className="bg-teal-500 text-white font-semibold px-6 py-2 rounded shadow hover:bg-teal-600 transition">
          GET A FREE CONSULTATION &rarr;
        </button>
      </section>

      {/* Services Section */}
      <section className="bg-gray-800 text-gray-300 py-20 px-8">
        <div className="max-w-6xl mx-auto text-center mb-12">
          <p className="text-teal-400 font-semibold tracking-widest mb-2">SERVICES</p>
          <h2 className="text-3xl font-semibold">We provide end-to-end solutions</h2>
        </div>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 text-left">
          {/* Left Column */}
          <div className="space-y-8">
            <ServiceItem
              icon={
                <svg
                  className="w-6 h-6 text-teal-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M3 7h18M3 12h18M3 17h18" />
                </svg>
              }
              title="Web Development"
              description="Product agency that relates people relations"
            />
            <ServiceItem
              icon={
                <svg
                  className="w-6 h-6 text-teal-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              }
              title="Graphic Design Services"
              description="Product agency that relates people relations"
            />
            <ServiceItem
              icon={
                <svg
                  className="w-6 h-6 text-teal-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 4v16m8-8H4" />
                </svg>
              }
              title="Digital Marketing"
              description="Product agency that relates people relations"
            />
          </div>
          {/* Right Column */}
          <div className="space-y-8">
            <ServiceItem
              icon={
                <svg
                  className="w-6 h-6 text-teal-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              }
              title="UI/UX Design"
              description="Product agency that relates people relations"
            />
            <ServiceItem
              icon={
                <svg
                  className="w-6 h-6 text-teal-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
                  <path d="M3 10h18" />
                </svg>
              }
              title="CMS"
              description="Product agency that relates people relations"
            />
            <ServiceItem
              icon={
                <svg
                  className="w-6 h-6 text-teal-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 2l4 4-4 4-4-4 4-4zM12 22l4-4-4-4-4 4 4 4z" />
                </svg>
              }
              title="AR and 2D Animation"
              description="Product agency that relates people relations"
            />
          </div>
        </div>
      </section>

      {/* Our Latest Work Section */}
      <section className="py-16 px-8 max-w-6xl mx-auto text-center">
        <p className="text-teal-500 font-semibold tracking-widest mb-2">OUR LATEST WORK</p>
        <h2 className="text-3xl font-semibold mb-8">Check out our case study!</h2>
        <div className="relative">
          <div className="flex space-x-6 overflow-x-auto scrollbar-hide px-4">
            {/* Placeholder images */}
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-64 h-40 rounded-lg overflow-hidden shadow-lg bg-gray-100"
              >
                <img
                  src={`https://via.placeholder.com/256x160?text=Case+Study+${i}`}
                  alt={`Case Study ${i}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
          {/* Arrows */}
          <button
            aria-label="Previous"
            className="absolute top-1/2 left-0 transform -translate-y-1/2 bg-gray-200 rounded-full p-2 shadow hover:bg-gray-300"
            onClick={() => {
              const container = document.querySelector('.scrollbar-hide');
              container.scrollBy({ left: -300, behavior: 'smooth' });
            }}
          >
            <
          </button>
          <button
            aria-label="Next"
            className="absolute top-1/2 right-0 transform -translate-y-1/2 bg-gray-200 rounded-full p-2 shadow hover:bg-gray-300"
            onClick={() => {
              const container = document.querySelector('.scrollbar-hide');
              container.scrollBy({ left: 300, behavior: 'smooth' });
            }}
          >
            >
          </button>
        </div>
        {/* Cartoon character bottom left */}
        <div className="absolute bottom-0 left-8 hidden md:block w-32 h-32">
          <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            <circle cx="100" cy="100" r="100" fill="#00a9b7" />
            <rect x="70" y="50" width="60" height="100" rx="20" fill="#e0e0e0" />
            <circle cx="100" cy="40" r="30" fill="#f0f0f0" />
            <circle cx="90" cy="35" r="5" fill="#000" />
            <circle cx="110" cy="35" r="5" fill="#000" />
            <path d="M80 140 Q100 160 120 140" stroke="#000" strokeWidth="3" fill="none" />
          </svg>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="bg-teal-500 text-black py-20 px-8 flex flex-col items-center justify-center relative overflow-hidden">
        <p className="uppercase text-sm tracking-widest mb-2 text-teal-200">START A PROJECT</p>
        <h2 className="text-4xl font-bold mb-6">Let’s work together</h2>
        <button className="bg-white text-teal-600 font-semibold px-6 py-2 rounded shadow hover:bg-gray-100 transition z-10">
          GET IN TOUCH &rarr;
        </button>
        {/* Decorative rings */}
        <div className="absolute top-10 left-10 w-32 h-32 border-8 border-teal-700 rounded-full opacity-50"></div>
        <div className="absolute bottom-10 right-10 w-32 h-32 border-8 border-teal-700 rounded-full opacity-50"></div>
      </section>

      {/* Our Clients Section */}
